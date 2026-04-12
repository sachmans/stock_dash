/**
 * Multi-Agent AI Analysis System
 * Inspired by HKUDS/AI-Trader and TradingAgents-CN
 *
 * Multiple AI "agents" analyze the same instrument from different perspectives,
 * then a moderator agent synthesizes their views into a final recommendation.
 *
 * All prompts are managed via skills.yaml and executed through the
 * skill-aware provider (remote skill execution → local prompt fallback).
 */

import { executeSkill } from "./lib/skillAwareProvider";
import { aiInvoke } from "./lib/aiProvider";

/* ─── Types ─── */

export interface AgentOpinion {
  agent: string;
  role: string;
  stance: "BULLISH" | "BEARISH" | "NEUTRAL";
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
    agreementLevel: "UNANIMOUS" | "MAJORITY" | "SPLIT" | "DIVIDED";
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

/* ─── Skill-to-Agent Mapping ─── */

const AGENT_SKILLS: Record<string, { skillName: string; displayName: string }> = {
  technical: {
    skillName: "stockdash.agent_technical",
    displayName: "Technical Analyst",
  },
  fundamental: {
    skillName: "stockdash.agent_fundamental",
    displayName: "Fundamental Analyst",
  },
  sentiment: {
    skillName: "stockdash.agent_sentiment",
    displayName: "Sentiment Analyst",
  },
  risk: {
    skillName: "stockdash.agent_risk",
    displayName: "Risk Manager",
  },
};

/* ─── Agent Execution via Skills ─── */

async function runAgent(
  role: string,
  roleName: string,
  input: AnalysisInput,
): Promise<AgentOpinion> {
  const agentConfig = AGENT_SKILLS[role];

  try {
    // Build knowledge context from input data
    const knowledgeContext = [
      `Change: ${input.change > 0 ? "+" : ""}${input.change.toFixed(3)} (${input.changePercent > 0 ? "+" : ""}${input.changePercent.toFixed(2)}%)`,
      `Day Range: ${input.dayLow} - ${input.dayHigh}`,
      `52-Week Range: ${input.fiftyTwoWeekLow || "N/A"} - ${input.fiftyTwoWeekHigh || "N/A"}`,
      `Volume: ${input.volume?.toLocaleString() || "N/A"}`,
      `Previous Close: ${input.previousClose || "N/A"}`,
      `Exchange: ${input.exchange || "N/A"}`,
      input.technicalSignals
        ? `Technical Signals: ${input.technicalSignals.join("; ")}`
        : "",
      input.dailyTrend
        ? `Daily Trend: ${input.dailyTrend} (Strength: ${input.dailyStrength}/100)`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (agentConfig) {
      // Use skill-aware provider
      const result = await executeSkill(agentConfig.skillName, {
        symbol: input.symbol,
        name: input.name,
        price: input.price,
        currency: input.currency || "USD",
        knowledge_context: knowledgeContext,
      });

      const output =
        typeof result.output === "string"
          ? safeJsonParse(result.output)
          : result.output;

      // Map skill output to AgentOpinion
      const stance = mapStance(
        (output as any)?.signal ||
          (output as any)?.outlook ||
          (output as any)?.sentiment ||
          (output as any)?.riskLevel ||
          "NEUTRAL",
      );

      return {
        agent: roleName,
        role,
        stance,
        confidence: Math.max(
          0,
          Math.min(100, Math.round(((output as any)?.confidence || 0.5) * 100)),
        ),
        reasoning: (output as any)?.summary || "Analysis completed via skill.",
        keyPoints: extractKeyPoints(output as Record<string, unknown>),
      };
    }

    // Fallback: use direct aiInvoke with hardcoded prompt (should not happen)
    return await runAgentFallback(role, roleName, input, knowledgeContext);
  } catch (err) {
    console.error(`[MultiAgent] ${roleName} agent failed:`, err);
    return {
      agent: roleName,
      role,
      stance: "NEUTRAL",
      confidence: 30,
      reasoning: `${roleName} analysis could not be completed due to an error.`,
      keyPoints: ["Analysis unavailable"],
    };
  }
}

/**
 * Fallback for agents without a registered skill — uses direct aiInvoke.
 */
async function runAgentFallback(
  role: string,
  roleName: string,
  input: AnalysisInput,
  knowledgeContext: string,
): Promise<AgentOpinion> {
  const prompt = `You are a ${roleName}. Analyze ${input.name} (${input.symbol}) at ${input.price} ${input.currency || "USD"}.

${knowledgeContext}

Respond with JSON: { "stance": "BULLISH|BEARISH|NEUTRAL", "confidence": 0-100, "reasoning": "...", "keyPoints": ["..."] }`;

  const response = await aiInvoke({
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Provide your ${roleName} analysis of ${input.symbol}. Be specific and data-driven.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "agent_opinion",
        strict: true,
        schema: {
          type: "object",
          properties: {
            stance: {
              type: "string",
              enum: ["BULLISH", "BEARISH", "NEUTRAL"],
              description: "Overall stance",
            },
            confidence: {
              type: "integer",
              description: "Confidence level 0-100",
            },
            reasoning: {
              type: "string",
              description: "2-3 sentence reasoning",
            },
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
    },
  });

  const content = response?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const parsed = JSON.parse(content as string);
  return {
    agent: roleName,
    role,
    stance: ["BULLISH", "BEARISH", "NEUTRAL"].includes(parsed.stance)
      ? parsed.stance
      : "NEUTRAL",
    confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
    reasoning: parsed.reasoning || "Analysis unavailable",
    keyPoints: Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.slice(0, 5)
      : [],
  };
}

/* ─── Moderator via Skill ─── */

async function runModerator(
  agents: AgentOpinion[],
  input: AnalysisInput,
): Promise<
  MultiAgentAnalysis["consensus"] &
    MultiAgentAnalysis["finalVerdict"] & { debate: string }
> {
  try {
    const agentSummaries = agents
      .map(
        (a) =>
          `**${a.agent}** (${a.stance}, ${a.confidence}% confidence): ${a.reasoning}\nKey points: ${a.keyPoints.join("; ")}`,
      )
      .join("\n\n");

    // Try skill-based execution first
    const result = await executeSkill("stockdash.agent_moderator", {
      symbol: input.symbol,
      name: input.name,
      price: input.price,
      currency: input.currency || "USD",
      technical_opinion: formatAgentForModerator(agents[0]),
      fundamental_opinion: formatAgentForModerator(agents[1]),
      sentiment_opinion: formatAgentForModerator(agents[2]),
      risk_opinion: formatAgentForModerator(agents[3]),
    });

    const output =
      typeof result.output === "string"
        ? safeJsonParse(result.output)
        : result.output;
    const o = output as Record<string, unknown>;

    return {
      recommendation: String(o.recommendation || "HOLD"),
      confidence: Math.max(
        0,
        Math.min(100, Math.round(Number(o.confidence || 0.5) * 100)),
      ),
      summary: String(o.summary || "Analysis complete."),
      agreementLevel: mapAgreement(String(o.consensus || "PARTIAL")),
      debate: String(o.dissenting || o.debate || "No debate summary available."),
      action: String(o.action || o.recommendation || "Hold current position"),
      buyLevel: Number((o.targets as any)?.entry) || input.price * 0.98,
      stopLoss: Number((o.targets as any)?.stopLoss) || input.price * 0.95,
      targetPrice:
        Number((o.targets as any)?.takeProfit) || input.price * 1.05,
      riskRewardRatio: 0,
      timeHorizon: String(o.timeframe || "1-2 weeks"),
    };
  } catch (err) {
    console.error("[MultiAgent] Moderator failed:", err);
    return {
      recommendation: "HOLD",
      confidence: 40,
      summary: "Multi-agent analysis could not reach a consensus.",
      agreementLevel: "DIVIDED",
      debate: "Analysis incomplete due to an error.",
      action: "Hold and monitor",
      buyLevel: input.price * 0.98,
      stopLoss: input.price * 0.95,
      targetPrice: input.price * 1.05,
      riskRewardRatio: 1.67,
      timeHorizon: "1-2 weeks",
    };
  }
}

/* ─── Main Entry Point ─── */

export async function runMultiAgentAnalysis(
  input: AnalysisInput,
): Promise<MultiAgentAnalysis> {
  const [technical, fundamental, sentiment, risk] = await Promise.all([
    runAgent("technical", "Technical Analyst", input),
    runAgent("fundamental", "Fundamental Analyst", input),
    runAgent("sentiment", "Sentiment Analyst", input),
    runAgent("risk", "Risk Manager", input),
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

/* ─── Helpers ─── */

function safeJsonParse(text: string): Record<string, unknown> {
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(jsonStr);
  } catch {
    return { summary: text };
  }
}

function mapStance(
  raw: string,
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const upper = String(raw).toUpperCase();
  if (
    upper.includes("BULL") ||
    upper.includes("POSITIVE") ||
    upper === "LOW"
  )
    return "BULLISH";
  if (
    upper.includes("BEAR") ||
    upper.includes("NEGATIVE") ||
    upper === "HIGH" ||
    upper === "EXTREME"
  )
    return "BEARISH";
  return "NEUTRAL";
}

function mapAgreement(
  raw: string,
): "UNANIMOUS" | "MAJORITY" | "SPLIT" | "DIVIDED" {
  const upper = String(raw).toUpperCase();
  if (upper.includes("AGREE") || upper === "UNANIMOUS") return "UNANIMOUS";
  if (upper.includes("PARTIAL") || upper === "MAJORITY") return "MAJORITY";
  if (upper.includes("DISAGREE") || upper === "DIVIDED") return "DIVIDED";
  return "SPLIT";
}

function formatAgentForModerator(agent: AgentOpinion): string {
  return `${agent.stance} (${agent.confidence}% confidence): ${agent.reasoning}\nKey points: ${agent.keyPoints.join("; ")}`;
}

function extractKeyPoints(output: Record<string, unknown>): string[] {
  // Try various field names that skills might return
  const candidates = [
    output.keyPoints,
    output.key_points,
    output.patterns,
    output.macroFactors,
    output.drivers,
    output.correlationRisks,
    output.tailRisks,
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      return c.filter((x) => typeof x === "string").slice(0, 5);
    }
  }

  // Build key points from available fields
  const points: string[] = [];
  if (output.summary) points.push(String(output.summary));
  if (output.valuation) points.push(`Valuation: ${output.valuation}`);
  if (output.riskLevel) points.push(`Risk Level: ${output.riskLevel}`);
  if (output.socialSignals) points.push(String(output.socialSignals));
  if (output.positionSizeAdvice) points.push(String(output.positionSizeAdvice));
  if (output.maxDrawdown) points.push(`Max Drawdown: ${output.maxDrawdown}`);

  return points.length > 0 ? points.slice(0, 5) : ["Analysis completed"];
}
