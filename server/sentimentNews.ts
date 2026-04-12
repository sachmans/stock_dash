/**
 * Sentiment-Scored News Engine
 *
 * Aggregates news from multiple sources and scores each article
 * with AI-powered sentiment analysis (bullish/bearish/neutral + score).
 *
 * All prompts are managed via skills.yaml and executed through the
 * skill-aware provider (remote skill execution → local prompt fallback).
 * Falls back to direct aiInvoke if skill execution fails.
 */

import { executeSkill } from "./lib/skillAwareProvider";
import { aiInvoke } from "./lib/aiProvider";

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
    label: "BULLISH" | "BEARISH" | "NEUTRAL";
    score: number;
    confidence: number;
  };
  impact: "HIGH" | "MEDIUM" | "LOW";
  category:
    | "earnings"
    | "macro"
    | "geopolitical"
    | "technical"
    | "sector"
    | "regulatory"
    | "general";
}

export interface NewsSentimentSummary {
  overallSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  averageScore: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  highImpactCount: number;
}

/* ─── Sentiment Analysis via Skill Provider ─── */

/**
 * Score a batch of news articles for sentiment using the skill-aware provider.
 * Tries the stockdash.sentiment_scorer skill first, falls back to direct aiInvoke.
 */
export async function scoreNewsSentiment(
  articles: Array<{ title: string; summary: string; source: string }>,
  symbol: string,
  instrumentName: string,
): Promise<
  Array<{
    sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    score: number;
    confidence: number;
    impact: "HIGH" | "MEDIUM" | "LOW";
    category:
      | "earnings"
      | "macro"
      | "geopolitical"
      | "technical"
      | "sector"
      | "regulatory"
      | "general";
  }>
> {
  if (articles.length === 0) return [];

  try {
    // Format articles for the skill template
    const articleList = articles
      .map(
        (a, i) =>
          `[${i}] "${a.title}" — ${a.summary || "No summary"} (Source: ${a.source})`,
      )
      .join("\n");

    // Try skill-based execution
    const result = await executeSkill("stockdash.sentiment_scorer", {
      symbol,
      name: instrumentName,
      articles: articleList, // Pre-formatted since the YAML template uses {% for %} which we handle as pre-formatted
    });

    const output =
      typeof result.output === "string"
        ? safeJsonParse(result.output)
        : result.output;

    // Handle both array and object-with-articles response shapes
    const scoredArray = Array.isArray(output)
      ? output
      : Array.isArray((output as any)?.articles)
        ? (output as any).articles
        : null;

    if (scoredArray && scoredArray.length > 0) {
      return articles.map((_, i) => {
        const item = scoredArray.find((s: any) => s.index === i) || scoredArray[i];
        if (!item) return defaultSentiment();

        // Normalize score: skill uses -1.0 to 1.0, we need -100 to 100
        const rawScore = Number(item.score || 0);
        const normalizedScore =
          Math.abs(rawScore) <= 1 ? Math.round(rawScore * 100) : rawScore;

        return {
          sentiment: mapSentimentLabel(normalizedScore, item.sentiment),
          score: Math.max(-100, Math.min(100, normalizedScore)),
          confidence: Math.max(
            0,
            Math.min(
              100,
              Math.round(Number(item.confidence || 0.5) * (item.confidence <= 1 ? 100 : 1)),
            ),
          ),
          impact: mapImpact(item.impact, Math.abs(normalizedScore)),
          category: mapCategory(item.category || item.rationale),
        };
      });
    }

    // Skill returned unexpected format, fall through to direct aiInvoke
    console.warn("[SentimentNews] Skill returned unexpected format, using direct aiInvoke");
  } catch (err) {
    console.warn("[SentimentNews] Skill execution failed, falling back to aiInvoke:", err);
  }

  // Fallback: direct aiInvoke with inline prompt
  return scoreNewsSentimentFallback(articles, symbol, instrumentName);
}

/**
 * Fallback sentiment scoring via direct aiInvoke.
 */
async function scoreNewsSentimentFallback(
  articles: Array<{ title: string; summary: string; source: string }>,
  symbol: string,
  instrumentName: string,
): Promise<
  Array<{
    sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    score: number;
    confidence: number;
    impact: "HIGH" | "MEDIUM" | "LOW";
    category:
      | "earnings"
      | "macro"
      | "geopolitical"
      | "technical"
      | "sector"
      | "regulatory"
      | "general";
  }>
> {
  try {
    const articleList = articles
      .map(
        (a, i) =>
          `[${i}] "${a.title}" — ${a.summary || "No summary"} (Source: ${a.source})`,
      )
      .join("\n");

    const response = await aiInvoke({
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
      response_format: {
        type: "json_schema",
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
                    index: {
                      type: "integer",
                      description: "Article index (0-based)",
                    },
                    sentiment: {
                      type: "string",
                      enum: ["BULLISH", "BEARISH", "NEUTRAL"],
                      description: "Sentiment label",
                    },
                    score: {
                      type: "integer",
                      description:
                        "Sentiment score from -100 (very bearish) to +100 (very bullish)",
                    },
                    confidence: {
                      type: "integer",
                      description:
                        "Confidence in the sentiment assessment 0-100",
                    },
                    impact: {
                      type: "string",
                      enum: ["HIGH", "MEDIUM", "LOW"],
                      description: "Expected market impact",
                    },
                    category: {
                      type: "string",
                      enum: [
                        "earnings",
                        "macro",
                        "geopolitical",
                        "technical",
                        "sector",
                        "regulatory",
                        "general",
                      ],
                      description: "News category",
                    },
                  },
                  required: [
                    "index",
                    "sentiment",
                    "score",
                    "confidence",
                    "impact",
                    "category",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["articles"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return articles.map(() => defaultSentiment());

    const parsed = JSON.parse(content as string);
    if (!Array.isArray(parsed.articles))
      return articles.map(() => defaultSentiment());

    return articles.map((_, i) => {
      const result = parsed.articles.find((a: any) => a.index === i);
      if (!result) return defaultSentiment();

      return {
        sentiment: (
          ["BULLISH", "BEARISH", "NEUTRAL"].includes(result.sentiment)
            ? result.sentiment
            : "NEUTRAL"
        ) as "BULLISH" | "BEARISH" | "NEUTRAL",
        score: Math.max(-100, Math.min(100, result.score || 0)),
        confidence: Math.max(0, Math.min(100, result.confidence || 50)),
        impact: (
          ["HIGH", "MEDIUM", "LOW"].includes(result.impact)
            ? result.impact
            : "LOW"
        ) as "HIGH" | "MEDIUM" | "LOW",
        category: (
          [
            "earnings",
            "macro",
            "geopolitical",
            "technical",
            "sector",
            "regulatory",
            "general",
          ].includes(result.category)
            ? result.category
            : "general"
        ) as any,
      };
    });
  } catch (err) {
    console.error("[SentimentNews] Fallback scoring failed:", err);
    return articles.map(() => defaultSentiment());
  }
}

function defaultSentiment() {
  return {
    sentiment: "NEUTRAL" as const,
    score: 0,
    confidence: 30,
    impact: "LOW" as const,
    category: "general" as const,
  };
}

/**
 * Calculate summary statistics from scored news items.
 */
export function calculateSentimentSummary(
  items: ScoredNewsItem[],
): NewsSentimentSummary {
  if (items.length === 0) {
    return {
      overallSentiment: "NEUTRAL",
      averageScore: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      highImpactCount: 0,
    };
  }

  const bullishCount = items.filter(
    (i) => i.sentiment.label === "BULLISH",
  ).length;
  const bearishCount = items.filter(
    (i) => i.sentiment.label === "BEARISH",
  ).length;
  const neutralCount = items.filter(
    (i) => i.sentiment.label === "NEUTRAL",
  ).length;
  const highImpactCount = items.filter((i) => i.impact === "HIGH").length;

  const weightedSum = items.reduce((sum, item) => {
    const weight =
      item.impact === "HIGH" ? 3 : item.impact === "MEDIUM" ? 2 : 1;
    return sum + item.sentiment.score * weight;
  }, 0);
  const totalWeight = items.reduce((sum, item) => {
    return sum + (item.impact === "HIGH" ? 3 : item.impact === "MEDIUM" ? 2 : 1);
  }, 0);
  const averageScore = Math.round(weightedSum / totalWeight);

  const overallSentiment: "BULLISH" | "BEARISH" | "NEUTRAL" =
    averageScore > 15 ? "BULLISH" : averageScore < -15 ? "BEARISH" : "NEUTRAL";

  return {
    overallSentiment,
    averageScore,
    bullishCount,
    bearishCount,
    neutralCount,
    highImpactCount,
  };
}

/* ─── Helpers ─── */

function safeJsonParse(text: string): Record<string, unknown> | unknown[] {
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(jsonStr);
  } catch {
    return { error: text };
  }
}

function mapSentimentLabel(
  score: number,
  raw?: string,
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (raw && ["BULLISH", "BEARISH", "NEUTRAL"].includes(String(raw).toUpperCase())) {
    return String(raw).toUpperCase() as "BULLISH" | "BEARISH" | "NEUTRAL";
  }
  if (score > 15) return "BULLISH";
  if (score < -15) return "BEARISH";
  return "NEUTRAL";
}

function mapImpact(
  raw?: string,
  absScore?: number,
): "HIGH" | "MEDIUM" | "LOW" {
  if (raw && ["HIGH", "MEDIUM", "LOW"].includes(String(raw).toUpperCase())) {
    return String(raw).toUpperCase() as "HIGH" | "MEDIUM" | "LOW";
  }
  if (absScore && absScore > 60) return "HIGH";
  if (absScore && absScore > 30) return "MEDIUM";
  return "LOW";
}

function mapCategory(
  raw?: string,
): "earnings" | "macro" | "geopolitical" | "technical" | "sector" | "regulatory" | "general" {
  const valid = [
    "earnings",
    "macro",
    "geopolitical",
    "technical",
    "sector",
    "regulatory",
    "general",
  ];
  if (raw && valid.includes(String(raw).toLowerCase())) {
    return String(raw).toLowerCase() as any;
  }
  return "general";
}
