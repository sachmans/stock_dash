/**
 * Unified AI Provider
 * 
 * Routes LLM requests through a priority chain:
 *   1. Core AI Backend (your own infrastructure) — primary
 *   2. Manus Forge LLM — fallback
 * 
 * Also integrates CognitionOS knowledge graph context enrichment
 * into prompts when available.
 * 
 * All AI-consuming modules (multi-agent analysis, sentiment scoring,
 * Kora chat, single-agent analysis) should use this provider
 * instead of calling invokeLLM directly.
 */

import {
  coreAiChatCompletion,
  isCoreAiBackendConfigured,
  type CoreAiMessage,
  type CoreAiCompletionResponse,
} from './coreAiBackend';
import {
  getKnowledgeContext,
  isCognitionOSConfigured,
} from './cognitionOS';
import { invokeLLM, type InvokeParams, type InvokeResult } from '../_core/llm';

/* ─── Types ─── */

export interface AiProviderRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema';
    json_schema?: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
  /** If set, CognitionOS context for this symbol will be injected into the system prompt */
  enrichWithKnowledgeGraph?: {
    symbol: string;
    additionalTerms?: string[];
  };
  /** Max tokens for the response */
  maxTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
}

export interface AiProviderResponse {
  content: string;
  provider: 'core_ai_backend' | 'manus_forge';
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  knowledgeContextInjected: boolean;
}

/* ─── Provider State ─── */

let coreAiFailCount = 0;
let coreAiLastFailTime = 0;
const CORE_AI_CIRCUIT_BREAKER_THRESHOLD = 3;
const CORE_AI_CIRCUIT_BREAKER_COOLDOWN = 120_000; // 2 minutes

function isCoreAiCircuitOpen(): boolean {
  if (coreAiFailCount < CORE_AI_CIRCUIT_BREAKER_THRESHOLD) return false;
  if (Date.now() - coreAiLastFailTime > CORE_AI_CIRCUIT_BREAKER_COOLDOWN) {
    // Reset circuit breaker after cooldown
    coreAiFailCount = 0;
    console.log('[AiProvider] Core AI Backend circuit breaker reset');
    return false;
  }
  return true;
}

function recordCoreAiFailure() {
  coreAiFailCount++;
  coreAiLastFailTime = Date.now();
  console.warn(
    `[AiProvider] Core AI Backend failure #${coreAiFailCount}${
      coreAiFailCount >= CORE_AI_CIRCUIT_BREAKER_THRESHOLD
        ? ' — circuit breaker OPEN, falling back to Manus Forge'
        : ''
    }`,
  );
}

function recordCoreAiSuccess() {
  if (coreAiFailCount > 0) {
    coreAiFailCount = 0;
    console.log('[AiProvider] Core AI Backend recovered');
  }
}

/* ─── Knowledge Graph Enrichment ─── */

async function enrichSystemPrompt(
  messages: AiProviderRequest['messages'],
  knowledgeConfig: AiProviderRequest['enrichWithKnowledgeGraph'],
): Promise<{ messages: AiProviderRequest['messages']; injected: boolean }> {
  if (!knowledgeConfig || !isCognitionOSConfigured()) {
    return { messages, injected: false };
  }

  try {
    const context = await getKnowledgeContext(
      knowledgeConfig.symbol,
      knowledgeConfig.additionalTerms,
    );

    if (!context.summary || context.confidence === 0) {
      return { messages, injected: false };
    }

    // Inject knowledge context into the first system message
    const enrichedMessages = messages.map((msg, i) => {
      if (i === 0 && msg.role === 'system') {
        return {
          ...msg,
          content: `${msg.content}\n\nKNOWLEDGE GRAPH CONTEXT (from CognitionOS):\n${context.summary}`,
        };
      }
      return msg;
    });

    return { messages: enrichedMessages, injected: true };
  } catch (err) {
    console.warn('[AiProvider] Knowledge enrichment failed:', err);
    return { messages, injected: false };
  }
}

/* ─── Main Provider Function ─── */

/**
 * Send a chat completion request through the AI provider chain.
 * Tries Core AI Backend first, falls back to Manus Forge LLM.
 */
export async function aiComplete(
  request: AiProviderRequest,
): Promise<AiProviderResponse> {
  // Step 1: Enrich with CognitionOS knowledge graph if requested
  const { messages, injected } = await enrichSystemPrompt(
    request.messages,
    request.enrichWithKnowledgeGraph,
  );

  // Step 2: Try Core AI Backend (primary)
  if (isCoreAiBackendConfigured() && !isCoreAiCircuitOpen()) {
    try {
      const coreResponse = await coreAiChatCompletion({
        messages: messages as CoreAiMessage[],
        response_format: request.response_format,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });

      const content = coreResponse.choices?.[0]?.message?.content;
      if (content) {
        recordCoreAiSuccess();
        return {
          content,
          provider: 'core_ai_backend',
          model: coreResponse.model,
          usage: coreResponse.usage,
          knowledgeContextInjected: injected,
        };
      }
    } catch (err) {
      recordCoreAiFailure();
      console.warn('[AiProvider] Core AI Backend failed, trying Manus Forge:', err);
    }
  }

  // Step 3: Fallback to Manus Forge LLM
  try {
    const forgeParams: InvokeParams = {
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    };

    if (request.response_format) {
      forgeParams.response_format = request.response_format as any;
    }

    const forgeResponse = await invokeLLM(forgeParams);
    const content = forgeResponse.choices?.[0]?.message?.content;

    return {
      content: typeof content === 'string' ? content : JSON.stringify(content),
      provider: 'manus_forge',
      model: forgeResponse.model,
      usage: forgeResponse.usage,
      knowledgeContextInjected: injected,
    };
  } catch (err) {
    console.error('[AiProvider] All providers failed:', err);
    throw new Error('All AI providers are unavailable');
  }
}

/* ─── Convenience: Get provider status ─── */

export function getProviderStatus(): {
  coreAiBackend: { configured: boolean; circuitOpen: boolean; failCount: number };
  cognitionOS: { configured: boolean };
  manusForge: { configured: boolean };
} {
  return {
    coreAiBackend: {
      configured: isCoreAiBackendConfigured(),
      circuitOpen: isCoreAiCircuitOpen(),
      failCount: coreAiFailCount,
    },
    cognitionOS: {
      configured: isCognitionOSConfigured(),
    },
    manusForge: {
      configured: true, // Always available in Manus hosting
    },
  };
}
