/**
 * Skill-Aware AI Provider
 * ========================
 * Wraps the Core AI Backend with skill-based prompt management.
 *
 * Execution flow:
 * 1. Try remote skill execution via /v1/skills/run-by-name (requires JWT)
 * 2. Fall back to local prompt rendering + /v1/chat (no auth needed)
 *
 * Model preference:
 * - llamacpp_ip provider (local Llama 3.3 / Gemma / Qwen) → primary
 * - groq provider → fallback
 */

import { getSkill, renderPrompt, type SkillDefinition } from "./skillLoader";
import { getCoreAIBackend } from "./coreAiBackend";
import type { Message } from "../_core/llm";

type CoreAiMessage = { role: string; content: string };

// ── Types ────────────────────────────────────────────────────────────

export interface SkillExecutionResult {
  output: Record<string, unknown> | string;
  model_used: string;
  execution_mode: "remote_skill" | "local_chat";
  skill_name: string;
  duration_ms: number;
}

// ── Model Configuration ──────────────────────────────────────────────

/**
 * Model preference order:
 * 1. llamacpp_ip — local Llama 3.3 / Gemma / Qwen (no API key, fastest for local)
 * 2. groq — Groq-hosted open-source models (fast cloud inference)
 */
const MODEL_PREFERENCE = {
  fast: {
    provider: "llamacpp_ip",
    model: undefined, // use server default (Gemma / Qwen)
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
  // Skip if no JWT configured
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

// ── Local Skill Execution (via /v1/chat) ─────────────────────────────

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

  // Try local llamacpp first
  try {
    const client = getCoreAIBackend();
    const result = await client.invoke({
      messages: messages.map(m => ({ role: m.role as any, content: m.content })),
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
  } catch (err) {
    // Fallback to Groq
    console.warn(
      `[SkillProvider] llamacpp failed for ${skill.name}, trying Groq:`,
      err
    );

    const client = getCoreAIBackend();
    const result = await client.invoke({
      messages: messages.map(m => ({ role: m.role as any, content: m.content })),
      temperature: 0.3,
      maxTokens: 2048,
    });

    const content = String(result.choices?.[0]?.message?.content || "");

    return {
      output: jsonMode ? safeJsonParse(content) : content,
      model_used: result.model || tier.fallback_model || "groq",
      execution_mode: "local_chat",
      skill_name: skill.name,
      duration_ms: Date.now() - start,
    };
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Execute a registered skill by name.
 * Tries remote execution first, falls back to local prompt rendering.
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

  // Fall back to local execution
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

  try {
    // Try local llamacpp first
    const client = getCoreAIBackend();
    const result = await client.invoke({
      messages: fullMessages.map(m => ({ role: m.role as any, content: m.content })),
      temperature: 0.7,
      maxTokens: 2048,
    });

    return {
      content: String(result.choices?.[0]?.message?.content || ""),
      model: result.model || tier.provider,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    // Fallback to Groq
    console.warn(`[SkillProvider] llamacpp failed for chat, trying Groq`);

    const client = getCoreAIBackend();
    const result = await client.invoke({
      messages: fullMessages.map(m => ({ role: m.role as any, content: m.content })),
      temperature: 0.7,
      maxTokens: 2048,
    });

    return {
      content: String(result.choices?.[0]?.message?.content || ""),
      model: result.model || tier.fallback_model || "groq",
      duration_ms: Date.now() - start,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function safeJsonParse(text: string): Record<string, unknown> | string {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(jsonStr);
  } catch {
    return text;
  }
}
