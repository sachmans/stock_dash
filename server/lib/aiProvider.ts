/**
 * Unified AI Provider — Core AI Backend primary, Manus Forge fallback
 * 
 * All LLM calls route through the Core AI Backend first.
 * If Core AI is down (transient 5xx / connection errors), falls back
 * to the Manus built-in Forge API so the app stays functional for demos.
 * 
 * Usage:
 *   import { aiInvoke } from './lib/aiProvider';
 *   const result = await aiInvoke(params); // Returns InvokeResult (OpenAI format)
 */

import type { InvokeParams, InvokeResult, Message } from "../_core/llm";
import { getCoreAIBackend } from "./coreAiBackend";

/* ─── Manus Forge Config ─── */

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL || "";
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY || "";

function isForgeAvailable(): boolean {
  return !!(FORGE_API_URL && FORGE_API_KEY);
}

/* ─── Health Tracking ─── */

interface HealthState {
  lastSuccess: number;
  lastFailure: number;
  consecutiveFailures: number;
  lastForgeSuccess: number;
}

const health: HealthState = {
  lastSuccess: 0,
  lastFailure: 0,
  consecutiveFailures: 0,
  lastForgeSuccess: 0,
};

/* ─── Provider Status ─── */

export type ProviderName = 'core_ai_backend' | 'manus_forge';

export function getProviderStatus(): {
  activeProvider: ProviderName;
  healthy: boolean;
  consecutiveFailures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  coreAiUrl: string;
  forgeFallbackAvailable: boolean;
} {
  return {
    activeProvider: health.consecutiveFailures >= 3 && isForgeAvailable() ? 'manus_forge' : 'core_ai_backend',
    healthy: health.consecutiveFailures < 5 || isForgeAvailable(),
    consecutiveFailures: health.consecutiveFailures,
    lastSuccess: health.lastSuccess || health.lastForgeSuccess || null,
    lastFailure: health.lastFailure || null,
    coreAiUrl: process.env.CORE_AI_BACKEND_URL || 'https://ai.s9n.dxb-gw.basanti.ai',
    forgeFallbackAvailable: isForgeAvailable(),
  };
}

/* ─── Manus Forge Fallback ─── */

/**
 * Call Manus Forge /api/llm as a fallback.
 * Converts our InvokeParams to the Forge format and returns InvokeResult.
 */
async function invokeForge(params: InvokeParams): Promise<InvokeResult> {
  const url = `${FORGE_API_URL}/v1/chat/completions`;

  // Build the request body — Forge uses OpenAI-compatible format
  const body: Record<string, unknown> = {
    messages: params.messages.map((m: Message) => ({
      role: m.role,
      content: m.content,
    })),
  };

  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens || params.max_tokens) body.max_tokens = params.maxTokens || params.max_tokens;
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice || params.tool_choice) body.tool_choice = params.toolChoice || params.tool_choice;
  if (params.responseFormat || params.response_format) body.response_format = params.responseFormat || params.response_format;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Manus Forge returned ${resp.status}: ${text}`);
  }

  const data = await resp.json() as InvokeResult;
  return data;
}

/* ─── Main Entry Point ─── */

/**
 * Invoke LLM via Core AI Backend, with Manus Forge fallback.
 * Returns InvokeResult in OpenAI-compatible format.
 * 
 * Strategy:
 *   1. Try Core AI Backend
 *   2. On transient failure, retry once
 *   3. If still failing and Forge is available, fall back to Forge
 */
export async function aiInvoke(params: InvokeParams): Promise<InvokeResult> {
  const client = getCoreAIBackend();

  // First attempt — Core AI Backend
  try {
    const result = await client.invoke(params);
    health.lastSuccess = Date.now();
    health.consecutiveFailures = 0;
    return result;
  } catch (err) {
    const msg = (err as Error).message || '';
    const isTransient = msg.includes('timeout') || msg.includes('abort') ||
      msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') ||
      msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed');

    if (!isTransient) {
      health.lastFailure = Date.now();
      health.consecutiveFailures++;
      console.error('[AIProvider] Core AI Backend non-transient error:', msg);
      throw err;
    }

    console.warn('[AIProvider] Core AI Backend transient error, retrying once:', msg);
  }

  // Retry once for transient failures
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await client.invoke(params);
    health.lastSuccess = Date.now();
    health.consecutiveFailures = 0;
    return result;
  } catch (err) {
    health.lastFailure = Date.now();
    health.consecutiveFailures++;
    const coreMsg = (err as Error).message;
    console.error('[AIProvider] Core AI Backend retry failed:', coreMsg);

    // ── Manus Forge Fallback ──
    if (isForgeAvailable()) {
      console.warn('[AIProvider] Falling back to Manus Forge LLM...');
      try {
        const result = await invokeForge(params);
        health.lastForgeSuccess = Date.now();
        console.log('[AIProvider] Manus Forge fallback succeeded');
        return result;
      } catch (forgeErr) {
        console.error('[AIProvider] Manus Forge fallback also failed:', (forgeErr as Error).message);
        throw new Error(
          `All LLM providers failed. Core AI: ${coreMsg} | Forge: ${(forgeErr as Error).message}`
        );
      }
    }

    throw new Error(`Core AI Backend failed after retry: ${coreMsg}`);
  }
}

/**
 * Simple text generation via Core AI Backend /v1/llm/generate.
 */
export async function aiGenerate(prompt: string, systemPrompt?: string): Promise<string> {
  const client = getCoreAIBackend();
  const result = await client.generate({ prompt, system_prompt: systemPrompt });
  return result.text;
}

/**
 * Health check — verify Core AI Backend is reachable.
 */
export async function aiHealthCheck(): Promise<{ healthy: boolean; status?: string; version?: string; error?: string }> {
  try {
    const client = getCoreAIBackend();
    const result = await client.health();
    return { healthy: true, status: result.status, version: result.version };
  } catch (err) {
    return { healthy: false, error: (err as Error).message };
  }
}
