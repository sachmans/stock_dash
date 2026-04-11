/**
 * Core AI Backend Adapter
 * 
 * Connects to the SeKondBrain Core AI Backend (ai.s9n.dxb-gw.basanti.ai)
 * for LLM chat completions. This replaces direct Manus Forge LLM calls
 * with your own AI infrastructure.
 * 
 * The Core AI Backend exposes an OpenAI-compatible /v1/chat/completions endpoint
 * behind org/app authentication.
 * 
 * Environment variables:
 *   CORE_AI_BACKEND_URL  — e.g. https://ai.s9n.dxb-gw.basanti.ai:3006
 *   CORE_AI_BACKEND_API_KEY — e.g. sk_live_767d...
 */

export interface CoreAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CoreAiCompletionRequest {
  messages: CoreAiMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema';
    json_schema?: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
}

export interface CoreAiCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/* ─── Configuration ─── */

function getConfig() {
  return {
    baseUrl: (process.env.CORE_AI_BACKEND_URL || '').replace(/\/$/, ''),
    apiKey: process.env.CORE_AI_BACKEND_API_KEY || '',
  };
}

export function isCoreAiBackendConfigured(): boolean {
  const config = getConfig();
  return !!(config.baseUrl && config.apiKey);
}

/* ─── Chat Completions ─── */

export async function coreAiChatCompletion(
  request: CoreAiCompletionRequest,
): Promise<CoreAiCompletionResponse> {
  const config = getConfig();

  if (!config.baseUrl || !config.apiKey) {
    throw new Error(
      'Core AI Backend not configured. Set CORE_AI_BACKEND_URL and CORE_AI_BACKEND_API_KEY.',
    );
  }

  const url = `${config.baseUrl}/v1/chat/completions`;

  const payload: Record<string, unknown> = {
    model: request.model || 'default',
    messages: request.messages,
  };

  if (request.temperature !== undefined) payload.temperature = request.temperature;
  if (request.max_tokens !== undefined) payload.max_tokens = request.max_tokens;
  if (request.response_format) payload.response_format = request.response_format;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Core AI Backend request failed (${response.status} ${response.statusText}): ${errorText}`,
    );
  }

  return (await response.json()) as CoreAiCompletionResponse;
}

/* ─── Health Check ─── */

export async function coreAiHealthCheck(): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  const config = getConfig();
  if (!config.baseUrl) {
    return { available: false, error: 'CORE_AI_BACKEND_URL not set' };
  }

  try {
    const res = await fetch(`${config.baseUrl}/api/health`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return { available: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return { available: true, version: String(data.version || 'unknown') };
  } catch (err: any) {
    return { available: false, error: err.message };
  }
}

/* ─── Memory / Episodes (for portfolio context persistence) ─── */

export async function storeMemoryEpisode(
  appId: string,
  userId: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const config = getConfig();
  if (!config.baseUrl || !config.apiKey) return false;

  try {
    const res = await fetch(`${config.baseUrl}/api/v1/memory/episodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        user_id: userId,
        content,
        metadata: metadata || {},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[CoreAiBackend] Memory episode store failed:', err);
    return false;
  }
}

export async function storeMemoryFact(
  appId: string,
  userId: string,
  fact: string,
  category?: string,
): Promise<boolean> {
  const config = getConfig();
  if (!config.baseUrl || !config.apiKey) return false;

  try {
    const res = await fetch(`${config.baseUrl}/api/v1/memory/facts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        user_id: userId,
        fact,
        category: category || 'portfolio',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[CoreAiBackend] Memory fact store failed:', err);
    return false;
  }
}
