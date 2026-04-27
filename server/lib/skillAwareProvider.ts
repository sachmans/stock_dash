/**
 * Skill-Aware AI Provider
 * ========================
 * Wraps the Core AI Backend with skill-based prompt management.
 *
 * Execution flow:
 * 1. Try remote skill execution via /v1/skills/run-by-name (requires JWT)
 * 2. Fall back to local prompt rendering + /v1/chat (no auth needed)
 * 3. If Core AI is completely down, fall back to Manus Forge LLM
 *
 * Model preference:
 * - llamacpp_ip provider (local Llama 3.3 / Gemma / Qwen) → primary
 * - groq provider → fallback
 * - Manus Forge → emergency fallback when Core AI is down
 */

import { getSkill, renderPrompt, type SkillDefinition } from "./skillLoader";
import { getCoreAIBackend } from "./coreAiBackend";
import type { Message, InvokeResult } from "../_core/llm";

type CoreAiMessage = { role: string; content: string };

// ── Types ────────────────────────────────────────────────────────────

export interface SkillExecutionResult {
  output: Record<string, unknown> | string;
  model_used: string;
  execution_mode: "remote_skill" | "local_chat" | "forge_fallback";
  skill_name: string;
  duration_ms: number;
}

// ── Model Configuration ──────────────────────────────────────────────

const MODEL_PREFERENCE = {
  fast: {
    provider: "llamacpp_ip",
    model: undefined,
    fallback_provider: "groq",
    fallback_model: "llama-3.3-70b-versatile",
  },
  balanced: {
    provider: "llamacpp_ip",
    model: undefined,
    fallback_provider: "groq",
    fallback_model: "llama-3.3-70b-versatile",
  },
  capable: {
    provider: "llamacpp_ip",
    model: undefined,
    fallback_provider: "groq",
    fallback_model: "llama-3.3-70b-versatile",
  },
};

// ── Manus Forge Fallback ─────────────────────────────────────────────

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL || "";
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY || "";

function isForgeAvailable(): boolean {
  return !!(FORGE_API_URL && FORGE_API_KEY);
}

async function invokeForge(
  messages: CoreAiMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<InvokeResult> {
  const url = `${FORGE_API_URL}/v1/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2048,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Manus Forge returned ${resp.status}: ${text}`);
  }

  return (await resp.json()) as InvokeResult;
}

// ── Remote Skill Execution ───────────────────────────────────────────

const CORE_AI_URL =
  process.env.CORE_AI_BACKEND_URL || "https://ai.s9n.dxb-gw.basanti.ai";
const CORE_AI_JWT = process.env.CORE_AI_BACKEND_JWT || "";

let _remoteSkillsAvailable: boolean | null = null;

async function tryRemoteSkillExecution(
  skillName: string,
  inputs: Record<string, unknown>,
  modelOverride?: string
): Promise<SkillExecutionResult | null> {
  if (!CORE_AI_JWT) {
    if (_remoteSkillsAvailable === null) {
      console.log(
        "[SkillProvider] No CORE_AI_BACKEND_JWT configured, using local prompt mode"
      );
      _remoteSkillsAvailable = false;
    }
    return null;
  }

  try {
    const start = Date.now();
    const resp = await fetch(`${CORE_AI_URL}/v1/skills/run-by-name`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CORE_AI_JWT}`,
      },
      body: JSON.stringify({
        skill_name: skillName,
        inputs,
        model_override: modelOverride,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        console.warn(
          `[SkillProvider] Remote skill auth failed (${resp.status}), falling back to local`
        );
        _remoteSkillsAvailable = false;
        return null;
      }
      if (resp.status === 404) {
        console.warn(
          `[SkillProvider] Skill '${skillName}' not registered remotely, using local`
        );
        return null;
      }
      throw new Error(`Remote skill execution failed: ${resp.status}`);
    }

    const data = await resp.json();
    _remoteSkillsAvailable = true;

    return {
      output: data.output,
      model_used: data.model_used || "remote",
      execution_mode: "remote_skill",
      skill_name: skillName,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    console.warn(`[SkillProvider] Remote skill execution error:`, err);
    return null;
  }
}

// ── Local Skill Execution (via /v1/chat → Forge fallback) ────────────

async function localSkillExecution(
  skill: SkillDefinition,
  variables: Record<string, string | number | undefined>,
  jsonMode: boolean = true
): Promise<SkillExecutionResult> {
  const start = Date.now();
  const { systemPrompt, userPrompt } = renderPrompt(skill, variables);

  const tier =
    MODEL_PREFERENCE[skill.model_tier as keyof typeof MODEL_PREFERENCE] ||
    MODEL_PREFERENCE.balanced;

  const messages: CoreAiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // Try Core AI Backend first
  try {
    const client = getCoreAIBackend();
    const result = await client.invoke({
      messages: messages.map((m) => ({
        role: m.role as any,
        content: m.content,
      })),
      temperature: 0.3,
      maxTokens: 2048,
    });

    const content = String(result.choices?.[0]?.message?.content || "");

    return {
      output: jsonMode ? safeJsonParse(content) : content,
      model_used: result.model || tier.provider,
      execution_mode: "local_chat",
      skill_name: skill.name,
      duration_ms: Date.now() - start,
    };
  } catch (coreErr) {
    console.warn(
      `[SkillProvider] Core AI failed for ${skill.name}:`,
      (coreErr as Error).message
    );

    // ── Manus Forge Fallback ──
    if (isForgeAvailable()) {
      console.warn(
        `[SkillProvider] Falling back to Manus Forge for ${skill.name}`
      );
      try {
        const result = await invokeForge(messages, {
          temperature: 0.3,
          maxTokens: 2048,
        });
        const content = String(result.choices?.[0]?.message?.content || "");

        return {
          output: jsonMode ? safeJsonParse(content) : content,
          model_used: result.model || "manus-forge",
          execution_mode: "forge_fallback",
          skill_name: skill.name,
          duration_ms: Date.now() - start,
        };
      } catch (forgeErr) {
        console.error(
          `[SkillProvider] Forge fallback also failed for ${skill.name}:`,
          (forgeErr as Error).message
        );
        throw new Error(
          `All providers failed for ${skill.name}. Core AI: ${(coreErr as Error).message} | Forge: ${(forgeErr as Error).message}`
        );
      }
    }

    throw coreErr;
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Execute a registered skill by name.
 * Tries remote execution first, falls back to local prompt rendering,
 * then to Manus Forge if Core AI is completely down.
 */
export async function executeSkill(
  skillName: string,
  variables: Record<string, string | number | undefined>,
  options?: { jsonMode?: boolean; modelOverride?: string }
): Promise<SkillExecutionResult> {
  const jsonMode = options?.jsonMode ?? true;

  // Try remote skill execution first
  if (_remoteSkillsAvailable !== false) {
    const remoteResult = await tryRemoteSkillExecution(
      skillName,
      variables as Record<string, unknown>,
      options?.modelOverride
    );
    if (remoteResult) return remoteResult;
  }

  // Fall back to local execution (with Forge fallback built in)
  const skill = getSkill(skillName);
  if (!skill) {
    throw new Error(
      `Skill '${skillName}' not found in local registry. Check skills.yaml.`
    );
  }

  return localSkillExecution(skill, variables, jsonMode);
}

/**
 * Execute a raw chat message (for Kora chat and ad-hoc queries).
 * Uses the kora_chat skill's system prompt but with custom user messages.
 * Falls back to Manus Forge if Core AI is down.
 */
export async function executeChat(
  messages: CoreAiMessage[],
  options?: {
    skillName?: string;
    provider?: string;
    model?: string;
  }
): Promise<{ content: string; model: string; duration_ms: number }> {
  const start = Date.now();
  const skillName = options?.skillName || "stockdash.kora_chat";
  const skill = getSkill(skillName);

  // Prepend skill system prompt if available
  const fullMessages: CoreAiMessage[] = skill
    ? [{ role: "system", content: skill.system_prompt.trim() }, ...messages]
    : messages;

  const tier = MODEL_PREFERENCE.balanced;

  // Try Core AI Backend
  try {
    const client = getCoreAIBackend();
    const result = await client.invoke({
      messages: fullMessages.map((m) => ({
        role: m.role as any,
        content: m.content,
      })),
      temperature: 0.7,
      maxTokens: 2048,
    });

    return {
      content: String(result.choices?.[0]?.message?.content || ""),
      model: result.model || tier.provider,
      duration_ms: Date.now() - start,
    };
  } catch (coreErr) {
    console.warn(
      `[SkillProvider] Core AI failed for chat:`,
      (coreErr as Error).message
    );

    // ── Manus Forge Fallback ──
    if (isForgeAvailable()) {
      console.warn(`[SkillProvider] Falling back to Manus Forge for chat`);
      try {
        const result = await invokeForge(fullMessages, {
          temperature: 0.7,
          maxTokens: 2048,
        });

        return {
          content: String(result.choices?.[0]?.message?.content || ""),
          model: result.model || "manus-forge",
          duration_ms: Date.now() - start,
        };
      } catch (forgeErr) {
        console.error(
          `[SkillProvider] Forge fallback also failed for chat:`,
          (forgeErr as Error).message
        );
        throw new Error(
          `All providers failed for chat. Core AI: ${(coreErr as Error).message} | Forge: ${(forgeErr as Error).message}`
        );
      }
    }

    throw coreErr;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function safeJsonParse(text: string): Record<string, unknown> | string {
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(jsonStr);
  } catch {
    return text;
  }
}
