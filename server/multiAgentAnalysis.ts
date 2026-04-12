/**
 * Multi-Agent AI Analysis System
 * Inspired by HKUDS/AI-Trader and TradingAgents-CN
 * 
 * Multiple AI "agents" analyze the same instrument from different perspectives,
 * then a moderator agent synthesizes their views into a final recommendation.
 * 
 * Now routes through the unified AI Provider (Core AI Backend → Manus Forge fallback).
 */

import { aiInvoke } from "./lib/aiProvider";

/* ─── Types ─── */

export interface AgentOpinion {
  agent: string;
  role: string;
  stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  reasoning: string;
  keyPoints: string[];
}

export interface MultiAgentAnalysis {
  agents: AgentOpinion[];
  consensus: {
    recommendation: string;
    confidence: number;
    summary: string;
    agreementLevel: 'UNANIMOUS' | 'MAJORITY' | 'SPLIT' | 'DIVIDED';
  };
  debate: string;
  finalVerdict: {
    action: string;
    buyLevel: number;
    stopLoss: number;
    targetPrice: number;
    riskRewardRatio: number;
    timeHorizon: string;
  };
  analyzedAt: number;
  symbol: string;
}

interface AnalysisInput {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume?: number;
  previousClose?: number;
  currency?: string;
  exchange?: string;
  technicalSignals?: string[];
  dailyTrend?: string;
  dailyStrength?: number;
}

/* ─── Agent Prompts ─── */

function buildAgentPrompt(role: string, input: AnalysisInput): string {
  const baseData = `
Instrument: ${input.name} (${input.symbol})
Current Price: ${input.price} ${input.currency || 'USD'}
Change: ${input.change > 0 ? '+' : ''}${input.change.toFixed(3)} (${input.changePercent > 0 ? '+' : ''}${input.changePercent.toFixed(2)}%)
Day Range: ${input.dayLow} - ${input.dayHigh}
52-Week Range: ${input.fiftyTwoWeekLow || 'N/A'} - ${input.fiftyTwoWeekHigh || 'N/A'}
Volume: ${input.volume?.toLocaleString() || 'N/A'}
Previous Close: ${input.previousClose || 'N/A'}
Exchange: ${input.exchange || 'N/A'}
${input.technicalSignals ? `Technical Signals: ${input.technicalSignals.join('; ')}` : ''}
${input.dailyTrend ? `Daily Trend: ${input.dailyTrend} (Strength: ${input.dailyStrength}/100)` : ''}
`;

  const rolePrompts: Record<string, string> = {
    technical: `You are a Technical Analyst agent. Analyze the following instrument PURELY from a technical analysis perspective. Focus on:
- Price action patterns (support/resistance, trend lines, chart patterns)
- Moving average analysis (SMA/EMA crossovers, golden/death crosses)
- Momentum indicators (RSI, MACD, Stochastic)
- Volume analysis and confirmation
- Bollinger Bands and volatility assessment
${baseData}`,

    fundamental: `You are a Fundamental Analyst agent. Analyze the following instrument from a fundamental/macro perspective. Focus on:
- Sector and industry trends
- Macroeconomic factors affecting this asset
- Supply/demand dynamics (especially for commodities)
- Geopolitical risks and opportunities
- Valuation relative to historical norms
${baseData}`,

    sentiment: `You are a Sentiment Analyst agent. Analyze the following instrument from a market sentiment perspective. Focus on:
- Current market mood and investor positioning
- News flow and media narrative
- Institutional vs retail sentiment
- Options flow and put/call ratios (if applicable)
- Social media and analyst consensus shifts
${baseData}`,

    risk: `You are a Risk Manager agent. Analyze the following instrument from a risk management perspective. Focus on:
- Volatility assessment (historical and implied)
- Maximum drawdown scenarios
- Correlation with broader market
- Liquidity risk assessment
- Position sizing recommendations
- Key risk events on the horizon
${baseData}`,
  };

  return rolePrompts[role] || rolePrompts.technical;
}

const AGENT_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "agent_opinion",
    strict: true,
    schema: {
      type: "object",
      properties: {
        stance: { type: "string", enum: ["BULLISH", "BEARISH", "NEUTRAL"], description: "Overall stance" },
        confidence: { type: "integer", description: "Confidence level 0-100" },
        reasoning: { type: "string", description: "2-3 sentence reasoning" },
        keyPoints: {
          type: "array",
          items: { type: "string" },
          description: "3-5 key bullet points supporting the stance",
        },
      },
      required: ["stance", "confidence", "reasoning", "keyPoints"],
      additionalProperties: false,
    },
  },
};

const MODERATOR_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "moderator_verdict",
    strict: true,
    schema: {
      type: "object",
      properties: {
        recommendation: {
          type: "string",
          enum: ["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"],
          description: "Final recommendation",
        },
        confidence: { type: "integer", description: "Overall confidence 0-100" },
        summary: { type: "string", description: "2-3 sentence executive summary" },
        agreementLevel: {
          type: "string",
          enum: ["UNANIMOUS", "MAJORITY", "SPLIT", "DIVIDED"],
          description: "How much the agents agree",
        },
        debate: { type: "string", description: "Summary of where agents agree and disagree" },
        action: { type: "string", description: "Specific action recommendation" },
        buyLevel: { type: "number", description: "Recommended entry price" },
        stopLoss: { type: "number", description: "Stop loss price" },
        targetPrice: { type: "number", description: "Target price" },
        timeHorizon: { type: "string", description: "Recommended time horizon (e.g., '1-2 weeks', '1-3 months')" },
      },
      required: [
        "recommendation", "confidence", "summary", "agreementLevel",
        "debate", "action", "buyLevel", "stopLoss", "targetPrice", "timeHorizon",
      ],
      additionalProperties: false,
    },
  },
};

/* ─── Agent Execution ─── */

async function runAgent(role: string, roleName: string, input: AnalysisInput): Promise<AgentOpinion> {
  try {
    const prompt = buildAgentPrompt(role, input);
    const response = await aiInvoke({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Provide your ${roleName} analysis of ${input.symbol}. Be specific and data-driven.` },
      ],
      response_format: AGENT_RESPONSE_FORMAT,
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty LLM response");

    const parsed = JSON.parse(content as string);
    return {
      agent: roleName,
      role,
      stance: ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(parsed.stance) ? parsed.stance : 'NEUTRAL',
      confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
      reasoning: parsed.reasoning || 'Analysis unavailable',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
    };
  } catch (err) {
    console.error(`[MultiAgent] ${roleName} agent failed:`, err);
    return {
      agent: roleName,
      role,
      stance: 'NEUTRAL',
      confidence: 30,
      reasoning: `${roleName} analysis could not be completed due to an error.`,
      keyPoints: ['Analysis unavailable'],
    };
  }
}

async function runModerator(
  agents: AgentOpinion[],
  input: AnalysisInput,
): Promise<MultiAgentAnalysis['consensus'] & MultiAgentAnalysis['finalVerdict'] & { debate: string }> {
  try {
    const agentSummaries = agents
      .map(
        (a) =>
          `**${a.agent}** (${a.stance}, ${a.confidence}% confidence): ${a.reasoning}\nKey points: ${a.keyPoints.join('; ')}`,
      )
      .join('\n\n');

    const response = await aiInvoke({
      messages: [
        {
          role: "system",
          content: `You are the Moderator agent. You have received analysis from 4 specialist agents about ${input.name} (${input.symbol}) at ${input.price} ${input.currency || 'USD'}. Your job is to:
1. Weigh each agent's opinion based on their confidence and reasoning quality
2. Identify areas of agreement and disagreement
3. Synthesize a final recommendation with specific price levels
4. The buy level should be near the current price if bullish, or lower if bearish
5. Stop loss should protect against 2-5% downside
6. Target should reflect a realistic 1-3x risk/reward ratio`,
        },
        {
          role: "user",
          content: `Here are the agent analyses:\n\n${agentSummaries}\n\nProvide your moderator verdict.`,
        },
      ],
      response_format: MODERATOR_RESPONSE_FORMAT,
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty moderator response");

    const parsed = JSON.parse(content as string);

    return {
      recommendation: parsed.recommendation || 'HOLD',
      confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
      summary: parsed.summary || 'Analysis complete.',
      agreementLevel: parsed.agreementLevel || 'SPLIT',
      debate: parsed.debate || 'No debate summary available.',
      action: parsed.action || 'Hold current position',
      buyLevel: parsed.buyLevel || input.price * 0.98,
      stopLoss: parsed.stopLoss || input.price * 0.95,
      targetPrice: parsed.targetPrice || input.price * 1.05,
      riskRewardRatio: 0,
      timeHorizon: parsed.timeHorizon || '1-2 weeks',
    };
  } catch (err) {
    console.error('[MultiAgent] Moderator failed:', err);
    return {
      recommendation: 'HOLD',
      confidence: 40,
      summary: 'Multi-agent analysis could not reach a consensus.',
      agreementLevel: 'DIVIDED',
      debate: 'Analysis incomplete due to an error.',
      action: 'Hold and monitor',
      buyLevel: input.price * 0.98,
      stopLoss: input.price * 0.95,
      targetPrice: input.price * 1.05,
      riskRewardRatio: 1.67,
      timeHorizon: '1-2 weeks',
    };
  }
}

/* ─── Main Entry Point ─── */

export async function runMultiAgentAnalysis(input: AnalysisInput): Promise<MultiAgentAnalysis> {
  const [technical, fundamental, sentiment, risk] = await Promise.all([
    runAgent('technical', 'Technical Analyst', input),
    runAgent('fundamental', 'Fundamental Analyst', input),
    runAgent('sentiment', 'Sentiment Analyst', input),
    runAgent('risk', 'Risk Manager', input),
  ]);

  const agents = [technical, fundamental, sentiment, risk];
  const moderatorResult = await runModerator(agents, input);

  const riskRewardRatio =
    moderatorResult.stopLoss !== moderatorResult.buyLevel
      ? Math.round(
          ((moderatorResult.targetPrice - moderatorResult.buyLevel) /
            (moderatorResult.buyLevel - moderatorResult.stopLoss)) *
            100,
        ) / 100
      : 1.5;

  return {
    agents,
    consensus: {
      recommendation: moderatorResult.recommendation,
      confidence: moderatorResult.confidence,
      summary: moderatorResult.summary,
      agreementLevel: moderatorResult.agreementLevel,
    },
    debate: moderatorResult.debate,
    finalVerdict: {
      action: moderatorResult.action,
      buyLevel: moderatorResult.buyLevel,
      stopLoss: moderatorResult.stopLoss,
      targetPrice: moderatorResult.targetPrice,
      riskRewardRatio,
      timeHorizon: moderatorResult.timeHorizon,
    },
    analyzedAt: Date.now(),
    symbol: input.symbol,
  };
}
