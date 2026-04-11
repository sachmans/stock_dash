/**
 * Sentiment-Scored News Engine
 * Inspired by mvanhorn/last30days-skill
 * 
 * Aggregates news from multiple sources and scores each article
 * with AI-powered sentiment analysis (bullish/bearish/neutral + score).
 */

import { invokeLLM } from "./_core/llm";

/* ─── Types ─── */

export interface ScoredNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  imageUrl?: string;
  relatedSymbols: string[];
  sentiment: {
    label: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    score: number; // -100 to +100
    confidence: number; // 0-100
  };
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'earnings' | 'macro' | 'geopolitical' | 'technical' | 'sector' | 'regulatory' | 'general';
}

export interface NewsSentimentSummary {
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  averageScore: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  highImpactCount: number;
}

/* ─── Sentiment Analysis via LLM ─── */

const SENTIMENT_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "news_sentiment_batch",
    strict: true,
    schema: {
      type: "object",
      properties: {
        articles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "integer", description: "Article index (0-based)" },
              sentiment: {
                type: "string",
                enum: ["BULLISH", "BEARISH", "NEUTRAL"],
                description: "Sentiment label",
              },
              score: {
                type: "integer",
                description: "Sentiment score from -100 (very bearish) to +100 (very bullish)",
              },
              confidence: {
                type: "integer",
                description: "Confidence in the sentiment assessment 0-100",
              },
              impact: {
                type: "string",
                enum: ["HIGH", "MEDIUM", "LOW"],
                description: "Expected market impact",
              },
              category: {
                type: "string",
                enum: ["earnings", "macro", "geopolitical", "technical", "sector", "regulatory", "general"],
                description: "News category",
              },
            },
            required: ["index", "sentiment", "score", "confidence", "impact", "category"],
            additionalProperties: false,
          },
        },
      },
      required: ["articles"],
      additionalProperties: false,
    },
  },
};

/**
 * Score a batch of news articles for sentiment using LLM.
 */
export async function scoreNewsSentiment(
  articles: Array<{ title: string; summary: string; source: string }>,
  symbol: string,
  instrumentName: string,
): Promise<Array<{
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;
  confidence: number;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'earnings' | 'macro' | 'geopolitical' | 'technical' | 'sector' | 'regulatory' | 'general';
}>> {
  if (articles.length === 0) return [];

  try {
    const articleList = articles
      .map((a, i) => `[${i}] "${a.title}" — ${a.summary || 'No summary'} (Source: ${a.source})`)
      .join('\n');

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a financial news sentiment analyst. Analyze each news article's impact on ${instrumentName} (${symbol}). 
Score sentiment from -100 (extremely bearish) to +100 (extremely bullish). 
Consider: direct price impact, sector implications, macro effects, and market psychology.
Be precise — a general market article with no direct relevance should be NEUTRAL with LOW impact.`,
        },
        {
          role: "user",
          content: `Score the sentiment of these ${articles.length} articles for ${symbol}:\n\n${articleList}`,
        },
      ],
      response_format: SENTIMENT_RESPONSE_FORMAT,
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return articles.map(() => defaultSentiment());

    const parsed = JSON.parse(content as string);
    if (!Array.isArray(parsed.articles)) return articles.map(() => defaultSentiment());

    // Map results back to article indices
    return articles.map((_, i) => {
      const result = parsed.articles.find((a: any) => a.index === i);
      if (!result) return defaultSentiment();

      return {
        sentiment: (['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.sentiment) ? result.sentiment : 'NEUTRAL') as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        score: Math.max(-100, Math.min(100, result.score || 0)),
        confidence: Math.max(0, Math.min(100, result.confidence || 50)),
        impact: (['HIGH', 'MEDIUM', 'LOW'].includes(result.impact) ? result.impact : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
        category: (['earnings', 'macro', 'geopolitical', 'technical', 'sector', 'regulatory', 'general'].includes(result.category) ? result.category : 'general') as any,
      };
    });
  } catch (err) {
    console.error('[SentimentNews] Scoring failed:', err);
    return articles.map(() => defaultSentiment());
  }
}

function defaultSentiment() {
  return {
    sentiment: 'NEUTRAL' as const,
    score: 0,
    confidence: 30,
    impact: 'LOW' as const,
    category: 'general' as const,
  };
}

/**
 * Calculate summary statistics from scored news items.
 */
export function calculateSentimentSummary(items: ScoredNewsItem[]): NewsSentimentSummary {
  if (items.length === 0) {
    return {
      overallSentiment: 'NEUTRAL',
      averageScore: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      highImpactCount: 0,
    };
  }

  const bullishCount = items.filter((i) => i.sentiment.label === 'BULLISH').length;
  const bearishCount = items.filter((i) => i.sentiment.label === 'BEARISH').length;
  const neutralCount = items.filter((i) => i.sentiment.label === 'NEUTRAL').length;
  const highImpactCount = items.filter((i) => i.impact === 'HIGH').length;

  // Weighted average score (high impact articles count more)
  const weightedSum = items.reduce((sum, item) => {
    const weight = item.impact === 'HIGH' ? 3 : item.impact === 'MEDIUM' ? 2 : 1;
    return sum + item.sentiment.score * weight;
  }, 0);
  const totalWeight = items.reduce((sum, item) => {
    return sum + (item.impact === 'HIGH' ? 3 : item.impact === 'MEDIUM' ? 2 : 1);
  }, 0);
  const averageScore = Math.round(weightedSum / totalWeight);

  const overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    averageScore > 15 ? 'BULLISH' : averageScore < -15 ? 'BEARISH' : 'NEUTRAL';

  return {
    overallSentiment,
    averageScore,
    bullishCount,
    bearishCount,
    neutralCount,
    highImpactCount,
  };
}
