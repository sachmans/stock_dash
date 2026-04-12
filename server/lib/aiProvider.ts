/**
 * Unified AI Provider — Core AI Backend ONLY
 * 
 * All LLM calls route exclusively through the Core AI Backend
 * at ai.s9n.dxb-gw.basanti.ai. No Manus Forge fallback.
 * 
 * The /v1/chat endpoint requires NO authentication.
 * 
 * Usage:
 *   import { aiInvoke } from './lib/aiProvider';
 *   const result = await aiInvoke(params); // Returns InvokeResult (OpenAI format)
 */

import type { InvokeParams, InvokeResult } from "../_core/llm";
import { getCoreAIBackend } from "./coreAiBackend";

/* ─── Health Tracking ─── */

interface HealthState {
  lastSuccess: number;
  lastFailure: number;
  consecutiveFailures: number;
}

const health: HealthState = {
  lastSuccess: 0,
  lastFailure: 0,
  consecutiveFailures: 0,
};

/* ─── Provider Status ─── */

export type ProviderName = 'core_ai_backend';

export function getProviderStatus(): {
  activeProvider: ProviderName;
  healthy: boolean;
  consecutiveFailures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  coreAiUrl: string;
} {
  return {
    activeProvider: 'core_ai_backend',
    healthy: health.consecutiveFailures < 5,
    consecutiveFailures: health.consecutiveFailures,
    lastSuccess: health.lastSuccess || null,
    lastFailure: health.lastFailure || null,
    coreAiUrl: process.env.CORE_AI_BACKEND_URL || 'https://ai.s9n.dxb-gw.basanti.ai',
  };
}

/* ─── Main Entry Point ─── */

/**
 * Invoke LLM via Core AI Backend exclusively.
 * Returns InvokeResult in OpenAI-compatible format.
 * 
 * Retries once on transient failures (network timeout, 5xx).
 */
export async function aiInvoke(params: InvokeParams): Promise<InvokeResult> {
  const client = getCoreAIBackend();

  // First attempt
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
      // Non-transient error (4xx, parse error, etc.) — don't retry
      health.lastFailure = Date.now();
      health.consecutiveFailures++;
      console.error('[AIProvider] Core AI Backend non-transient error:', msg);
      throw err;
    }

    console.warn('[AIProvider] Core AI Backend transient error, retrying once:', msg);
  }

  // Retry once for transient failures
  try {
    // Brief delay before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await client.invoke(params);
    health.lastSuccess = Date.now();
    health.consecutiveFailures = 0;
    return result;
  } catch (err) {
    health.lastFailure = Date.now();
    health.consecutiveFailures++;
    console.error('[AIProvider] Core AI Backend retry failed:', (err as Error).message);
    throw new Error(`Core AI Backend failed after retry: ${(err as Error).message}`);
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
