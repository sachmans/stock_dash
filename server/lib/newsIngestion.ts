/**
 * News Ingestion Pipeline
 * 
 * Pushes scored news articles into CognitionOS as Document nodes
 * and indexes them in Weaviate for semantic search.
 * Also stores high-impact news as Memory Vault episodes for agentic recall.
 * 
 * Flow:
 * 1. News articles arrive with sentiment scores from sentimentNews.ts
 * 2. Each article is created as a Document node in CognitionOS
 * 3. A reasoning node captures the sentiment analysis decision
 * 4. Articles are batch-indexed in Weaviate for vector search
 * 5. High-impact articles are stored as Memory Vault episodes
 */

import { getCognitionOS } from './cognitionOSClient';
import { getMemoryVault } from './memoryVaultClient';

/* ─── Types ─── */

export interface ScoredArticle {
  title: string;
  summary: string;
  source: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;        // -100 to +100
  confidence: number;   // 0-100
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
}

export interface IngestionResult {
  articlesIngested: number;
  reasoningNodesCreated: number;
  episodesStored: number;
  vectorsIndexed: number;
  errors: string[];
}

/* ─── Ingestion Pipeline ─── */

/**
 * Ingest scored news articles into CognitionOS and Memory Vault.
 * Runs as a fire-and-forget background task after sentiment scoring.
 */
export async function ingestScoredNews(
  articles: ScoredArticle[],
  symbol: string,
  instrumentName: string,
): Promise<IngestionResult> {
  const result: IngestionResult = {
    articlesIngested: 0,
    reasoningNodesCreated: 0,
    episodesStored: 0,
    vectorsIndexed: 0,
    errors: [],
  };

  if (articles.length === 0) return result;

  const cogOS = getCognitionOS();
  const memVault = getMemoryVault();

  // Step 1: Create Document nodes for each article
  const documentIds: string[] = [];
  for (const article of articles) {
    try {
      const docContent = [
        `Title: ${article.title}`,
        `Source: ${article.source}`,
        `Summary: ${article.summary}`,
        `Sentiment: ${article.sentiment} (score: ${article.score}, confidence: ${article.confidence}%)`,
        `Impact: ${article.impact}`,
        `Category: ${article.category}`,
        `Symbol: ${symbol} (${instrumentName})`,
      ].join('\n');

      const node = await cogOS.createNode({
        name: article.title.slice(0, 100),
        nodeType: 'Document',
        description: docContent,
        graphType: 'concept',
        metadata: {
          source: article.source,
          symbol,
          instrument_name: instrumentName,
          sentiment: article.sentiment,
          sentiment_score: article.score,
          confidence: article.confidence,
          impact: article.impact,
          category: article.category,
          ingested_at: new Date().toISOString(),
        },
      });

      documentIds.push(node.id);
      result.articlesIngested++;
    } catch (err: any) {
      result.errors.push(`Doc node failed for "${article.title.slice(0, 50)}": ${err.message}`);
    }
  }

  // Step 2: Create a reasoning node summarizing the sentiment analysis
  try {
    const bullish = articles.filter(a => a.sentiment === 'BULLISH').length;
    const bearish = articles.filter(a => a.sentiment === 'BEARISH').length;
    const neutral = articles.filter(a => a.sentiment === 'NEUTRAL').length;
    const avgScore = Math.round(articles.reduce((s, a) => s + a.score, 0) / articles.length);
    const highImpact = articles.filter(a => a.impact === 'HIGH');

    const reasoningContent = [
      `Sentiment Analysis for ${instrumentName} (${symbol})`,
      `Analyzed ${articles.length} articles: ${bullish} bullish, ${bearish} bearish, ${neutral} neutral`,
      `Average sentiment score: ${avgScore}/100`,
      highImpact.length > 0
        ? `High-impact articles: ${highImpact.map(a => a.title.slice(0, 60)).join('; ')}`
        : 'No high-impact articles detected',
      `Overall assessment: ${avgScore > 15 ? 'BULLISH' : avgScore < -15 ? 'BEARISH' : 'NEUTRAL'} bias in news flow`,
    ].join('\n');

    await cogOS.createReasoningNode({
      reasoningType: 'observation',
      content: reasoningContent,
      confidence: Math.min(1.0, (articles.reduce((s, a) => s + a.confidence, 0) / articles.length) / 100),
      producedEntityIds: documentIds,
      metadata: {
        type: 'sentiment_analysis',
        symbol,
        instrument_name: instrumentName,
        article_count: articles.length,
        avg_score: avgScore,
        timestamp: new Date().toISOString(),
      },
    });

    result.reasoningNodesCreated++;
  } catch (err: any) {
    result.errors.push(`Reasoning node failed: ${err.message}`);
  }

  // Step 3: Batch-index articles in Weaviate for semantic search
  try {
    const entities = documentIds.map((id, i) => ({
      entityId: id,
      name: articles[i].title.slice(0, 100),
      description: `${articles[i].summary} [${articles[i].sentiment}, impact: ${articles[i].impact}]`,
      nodeType: 'Document' as const,
      contentType: 'news_article',
      metadata: { symbol, source: articles[i].source },
    }));

    if (entities.length > 0) {
      await cogOS.vectorBatchIndex(entities);
      result.vectorsIndexed = entities.length;
    }
  } catch (err: any) {
    result.errors.push(`Vector index failed: ${err.message}`);
  }

  // Step 4: Store high-impact articles as Memory Vault episodes
  const highImpactArticles = articles.filter(a => a.impact === 'HIGH');
  for (const article of highImpactArticles) {
    try {
      await memVault.storeTradeEpisode({
        symbol,
        action: 'news_alert',
        content: `HIGH IMPACT NEWS for ${instrumentName} (${symbol}): "${article.title}" — ${article.summary}. Sentiment: ${article.sentiment} (score: ${article.score}). Source: ${article.source}. Category: ${article.category}.`,
        metadata: {
          sentiment: article.sentiment,
          score: article.score,
          impact: article.impact,
          source: article.source,
        },
      });
      result.episodesStored++;
    } catch (err: any) {
      result.errors.push(`Memory episode failed for "${article.title.slice(0, 50)}": ${err.message}`);
    }
  }

  console.log(`[NewsIngestion] ${symbol}: ${result.articlesIngested} docs, ${result.reasoningNodesCreated} reasoning, ${result.episodesStored} episodes, ${result.vectorsIndexed} vectors, ${result.errors.length} errors`);

  return result;
}

/**
 * Search CognitionOS for news articles related to a symbol.
 * Uses Weaviate semantic search for relevance-ranked results.
 */
export async function searchRelatedNews(
  query: string,
  topK = 5,
): Promise<Array<{ name: string; description: string; score: number }>> {
  try {
    const cogOS = getCognitionOS();
    const results = await cogOS.vectorSearch(query, topK, 0.3);
    return results.map(r => ({
      name: r.name,
      description: r.description,
      score: r.score,
    }));
  } catch (err: any) {
    console.error('[NewsIngestion] Search failed:', err.message);
    return [];
  }
}
