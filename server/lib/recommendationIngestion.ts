/**
 * Recommendation Ingestion Pipeline
 * 
 * Pushes AI analysis recommendations into CognitionOS as ReasoningNodes
 * (Graph of Thought) and stores them in Memory Vault as episodes + facts.
 * 
 * Flow:
 * 1. Multi-agent or single-agent analysis produces a recommendation
 * 2. The recommendation is stored as a ReasoningNode (type: decision) in CognitionOS
 * 3. Individual agent opinions are stored as child ReasoningNodes (type: inference)
 * 4. The full analysis is stored as a Memory Vault episode
 * 5. Key facts (verdict, price targets, risk level) are stored as Memory Vault facts
 */

import { getCognitionOS } from './cognitionOSClient';
import { getMemoryVault } from './memoryVaultClient';

/* ─── Types ─── */

export interface AgentOpinion {
  agentName: string;
  role: string;
  verdict: string;
  confidence: number;
  reasoning: string;
  keyPoints: string[];
}

export interface AnalysisRecommendation {
  symbol: string;
  instrumentName: string;
  finalVerdict: string;          // BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL
  confidence: number;            // 0-100
  consensusScore: number;        // -100 to +100
  moderatorSummary: string;
  agentOpinions: AgentOpinion[];
  priceTarget?: number;
  stopLoss?: number;
  timeHorizon?: string;
  riskLevel?: string;
  analysisType: 'multi_agent' | 'single_agent';
}

export interface RecommendationIngestionResult {
  decisionNodeId?: string;
  agentNodeIds: string[];
  episodeId?: string;
  factsCreated: number;
  errors: string[];
}

/* ─── Ingestion Pipeline ─── */

/**
 * Ingest an AI analysis recommendation into CognitionOS and Memory Vault.
 * Runs as a fire-and-forget background task after analysis completes.
 */
export async function ingestRecommendation(
  rec: AnalysisRecommendation,
): Promise<RecommendationIngestionResult> {
  const result: RecommendationIngestionResult = {
    agentNodeIds: [],
    factsCreated: 0,
    errors: [],
  };

  const cogOS = getCognitionOS();
  const memVault = getMemoryVault();

  // Step 1: Create child ReasoningNodes for each agent opinion
  for (const agent of rec.agentOpinions) {
    try {
      const agentContent = [
        `${agent.agentName} (${agent.role}) Analysis for ${rec.instrumentName} (${rec.symbol})`,
        `Verdict: ${agent.verdict} (confidence: ${agent.confidence}%)`,
        `Reasoning: ${agent.reasoning}`,
        `Key Points: ${agent.keyPoints.join('; ')}`,
      ].join('\n');

      const node = await cogOS.createReasoningNode({
        reasoningType: 'inference',
        content: agentContent,
        confidence: agent.confidence / 100,
        metadata: {
          type: 'agent_opinion',
          agent_name: agent.agentName,
          agent_role: agent.role,
          symbol: rec.symbol,
          verdict: agent.verdict,
          analysis_type: rec.analysisType,
          timestamp: new Date().toISOString(),
        },
      });

      result.agentNodeIds.push(node.id);
    } catch (err: any) {
      result.errors.push(`Agent node failed for ${agent.agentName}: ${err.message}`);
    }
  }

  // Step 2: Create the decision ReasoningNode (parent of agent opinions)
  try {
    const decisionContent = [
      `${rec.analysisType === 'multi_agent' ? 'Multi-Agent' : 'Single-Agent'} Analysis Decision for ${rec.instrumentName} (${rec.symbol})`,
      `Final Verdict: ${rec.finalVerdict} (confidence: ${rec.confidence}%, consensus: ${rec.consensusScore})`,
      rec.priceTarget ? `Price Target: ${rec.priceTarget}` : '',
      rec.stopLoss ? `Stop Loss: ${rec.stopLoss}` : '',
      rec.timeHorizon ? `Time Horizon: ${rec.timeHorizon}` : '',
      rec.riskLevel ? `Risk Level: ${rec.riskLevel}` : '',
      `Summary: ${rec.moderatorSummary}`,
    ].filter(Boolean).join('\n');

    const decisionNode = await cogOS.createReasoningNode({
      reasoningType: 'decision',
      content: decisionContent,
      confidence: rec.confidence / 100,
      parentIds: result.agentNodeIds,  // Links to agent inference nodes
      metadata: {
        type: 'trade_recommendation',
        symbol: rec.symbol,
        instrument_name: rec.instrumentName,
        final_verdict: rec.finalVerdict,
        consensus_score: rec.consensusScore,
        analysis_type: rec.analysisType,
        price_target: rec.priceTarget,
        stop_loss: rec.stopLoss,
        time_horizon: rec.timeHorizon,
        risk_level: rec.riskLevel,
        agent_count: rec.agentOpinions.length,
        timestamp: new Date().toISOString(),
      },
    });

    result.decisionNodeId = decisionNode.id;
  } catch (err: any) {
    result.errors.push(`Decision node failed: ${err.message}`);
  }

  // Step 3: Store the full analysis as a Memory Vault episode
  try {
    const episodeContent = [
      `=== ${rec.analysisType === 'multi_agent' ? 'Multi-Agent' : 'Single-Agent'} Analysis: ${rec.instrumentName} (${rec.symbol}) ===`,
      `Date: ${new Date().toISOString()}`,
      `Final Verdict: ${rec.finalVerdict} | Confidence: ${rec.confidence}% | Consensus: ${rec.consensusScore}`,
      rec.priceTarget ? `Price Target: ${rec.priceTarget}` : '',
      rec.stopLoss ? `Stop Loss: ${rec.stopLoss}` : '',
      rec.riskLevel ? `Risk Level: ${rec.riskLevel}` : '',
      '',
      '--- Agent Opinions ---',
      ...rec.agentOpinions.map(a =>
        `${a.agentName} (${a.role}): ${a.verdict} (${a.confidence}%) — ${a.reasoning.slice(0, 200)}`
      ),
      '',
      '--- Moderator Summary ---',
      rec.moderatorSummary,
    ].filter(l => l !== undefined).join('\n');

    const episode = await memVault.storeTradeEpisode({
      symbol: rec.symbol,
      action: `${rec.analysisType}_analysis`,
      content: episodeContent,
      metadata: {
        final_verdict: rec.finalVerdict,
        confidence: rec.confidence,
        consensus_score: rec.consensusScore,
        agent_count: rec.agentOpinions.length,
        cognition_decision_node: result.decisionNodeId,
      },
    });

    result.episodeId = episode.episode_id;
  } catch (err: any) {
    result.errors.push(`Memory episode failed: ${err.message}`);
  }

  // Step 4: Store key facts in Memory Vault
  const facts: Array<{ fact_type: string; content: string; metadata?: Record<string, any> }> = [];

  // Verdict fact
  facts.push({
    fact_type: 'trade_signal',
    content: `${rec.symbol} ${rec.finalVerdict} signal with ${rec.confidence}% confidence (${rec.analysisType} analysis)`,
    metadata: { symbol: rec.symbol, verdict: rec.finalVerdict, confidence: rec.confidence },
  });

  // Price target fact
  if (rec.priceTarget) {
    facts.push({
      fact_type: 'price_target',
      content: `${rec.symbol} price target: ${rec.priceTarget} (${rec.timeHorizon || 'unspecified horizon'})`,
      metadata: { symbol: rec.symbol, price_target: rec.priceTarget, time_horizon: rec.timeHorizon },
    });
  }

  // Risk fact
  if (rec.riskLevel) {
    facts.push({
      fact_type: 'risk_assessment',
      content: `${rec.symbol} risk level: ${rec.riskLevel}. ${rec.stopLoss ? `Stop loss at ${rec.stopLoss}` : ''}`,
      metadata: { symbol: rec.symbol, risk_level: rec.riskLevel, stop_loss: rec.stopLoss },
    });
  }

  if (facts.length > 0) {
    try {
      await memVault.createFacts({
        facts: facts.map(f => ({
          fact_type: f.fact_type,
          content: f.content,
          metadata: f.metadata,
        })),
      });
      result.factsCreated = facts.length;
    } catch (err: any) {
      result.errors.push(`Facts creation failed: ${err.message}`);
    }
  }

  console.log(`[RecIngestion] ${rec.symbol}: decision=${result.decisionNodeId || 'none'}, agents=${result.agentNodeIds.length}, episode=${result.episodeId || 'none'}, facts=${result.factsCreated}, errors=${result.errors.length}`);

  return result;
}

/**
 * Recall previous recommendations for a symbol from Memory Vault.
 * Used to provide context to new analysis runs.
 */
export async function recallPreviousRecommendations(
  symbol: string,
  limit = 3,
): Promise<string> {
  try {
    const memVault = getMemoryVault();
    const episodes = await memVault.recallAnalysis(symbol, limit);

    if (episodes.length === 0) {
      return '';
    }

    const context = episodes.map(ep => {
      return `[${ep.timestamp}] ${ep.summary}: ${ep.content.slice(0, 300)}...`;
    }).join('\n\n');

    return `\n\n--- Previous Analysis History (from Memory Vault) ---\n${context}`;
  } catch (err: any) {
    console.error('[RecIngestion] Recall failed:', err.message);
    return '';
  }
}

/**
 * Search CognitionOS for related reasoning nodes (past decisions).
 * Used for progressive extraction — building on past analysis.
 */
export async function searchRelatedDecisions(
  query: string,
  topK = 5,
): Promise<Array<{ name: string; description: string; score: number }>> {
  try {
    const cogOS = getCognitionOS();
    return await cogOS.vectorSearch(query, topK, 0.3);
  } catch (err: any) {
    console.error('[RecIngestion] CogOS search failed:', err.message);
    return [];
  }
}
