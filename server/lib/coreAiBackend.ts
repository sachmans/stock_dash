/**
 * Core AI Backend Client
 * 
 * Calls the live Core AI Backend at ai.s9n.dxb-gw.basanti.ai.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 * No authentication required.
 * 
 * Response format (OpenAI-compatible):
 *   { id, object, created, model, choices: [{ index, message, finish_reason }], usage }
 */

import type { InvokeParams, InvokeResult, Message } from "../_core/llm";

/* ─── Config ─── */

const DEFAULT_BASE_URL = 'https://ai.s9n.dxb-gw.basanti.ai';
const TIMEOUT_MS = 60_000; // 60s for LLM calls
const DEFAULT_MODEL = 'groq/llama-3.3-70b-versatile';

/* ─── Types ─── */

interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: any;
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string; tool_calls?: any };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface CoreAIGenerateRequest {
  prompt: string;
  system_prompt?: string;
  provider?: string;
  model?: string;
}

interface CoreAIGenerateResponse {
  text: string;
  provider: string;
  model: string;
  tokens_used: number;
}

/* ─── Client ─── */

export class CoreAIBackendClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.CORE_AI_BACKEND_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = TIMEOUT_MS;
  }

  /**
   * Call /v1/chat/completions — the OpenAI-compatible endpoint.
   * No auth required. Returns standard OpenAI chat completion response.
   */
  async chatCompletions(params: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Core AI /v1/chat/completions returned ${res.status}: ${text}`);
      }

      return await res.json() as OpenAIChatResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Call /v1/llm/generate — simple prompt-based generation.
   * No auth required.
   */
  async generate(params: CoreAIGenerateRequest): Promise<CoreAIGenerateResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/v1/llm/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Core AI /v1/llm/generate returned ${res.status}: ${text}`);
      }

      return await res.json() as CoreAIGenerateResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Health check.
   */
  async health(): Promise<{ status: string; version: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);

    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Health check returned ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * invokeLLM-compatible wrapper.
   * 
   * Takes InvokeParams (OpenAI format), calls /v1/chat/completions,
   * and returns the response directly (already in OpenAI format).
   * 
   * NOTE: If the Core AI Backend doesn't support response_format
   * (JSON schema enforcement), we embed the JSON schema instructions
   * into the system prompt so the model still returns structured JSON.
   */
  async invoke(params: InvokeParams): Promise<InvokeResult> {
    // Flatten messages to { role, content } strings
    const messages = params.messages.map(msg => ({
      role: msg.role as string,
      content: flattenContent(msg),
    }));

    // If response_format with json_schema is specified, inject schema into system prompt
    // (in case the backend LiteLLM doesn't support it natively)
    const responseFormat = params.responseFormat || params.response_format;
    if (responseFormat && responseFormat.type === 'json_schema') {
      const schema = responseFormat.json_schema;
      const schemaInstruction = `\n\nIMPORTANT: You MUST respond with ONLY valid JSON matching this exact schema:\n${JSON.stringify(schema.schema, null, 2)}\n\nDo not include any text before or after the JSON. Do not wrap in markdown code blocks.`;
      
      // Append to system message if exists, otherwise prepend a new one
      const systemIdx = messages.findIndex(m => m.role === 'system');
      if (systemIdx >= 0) {
        messages[systemIdx].content += schemaInstruction;
      } else {
        messages.unshift({ role: 'system', content: schemaInstruction.trim() });
      }
    }

    const chatResponse = await this.chatCompletions({
      model: DEFAULT_MODEL,
      messages,
      max_tokens: params.maxTokens || params.max_tokens,
    });

    // Response is already in OpenAI format, just normalize the types
    return {
      id: chatResponse.id,
      created: chatResponse.created,
      model: chatResponse.model,
      choices: chatResponse.choices.map(c => ({
        index: c.index,
        message: {
          role: c.message.role as 'assistant',
          content: c.message.content,
        },
        finish_reason: c.finish_reason || 'stop',
      })),
      usage: chatResponse.usage,
    };
  }
}

/* ─── Helpers ─── */

function flattenContent(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text;
        if (part.type === 'image_url') return `[Image: ${part.image_url.url}]`;
        if (part.type === 'file_url') return `[File: ${part.file_url.url}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  // Single content object
  const c = msg.content as any;
  if (c.type === 'text') return c.text;
  return String(c);
}

/* ─── Singleton ─── */

let _instance: CoreAIBackendClient | null = null;

export function getCoreAIBackend(): CoreAIBackendClient {
  if (!_instance) {
    _instance = new CoreAIBackendClient();
  }
  return _instance;
}

export function resetCoreAIBackend(): void {
  _instance = null;
}
