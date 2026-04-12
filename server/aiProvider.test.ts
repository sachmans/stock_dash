/**
 * AI Provider Unit Tests — Core AI Backend Only Mode
 * 
 * Tests the unified AI provider with Core AI Backend as the sole LLM provider.
 * Covers: successful calls, transient retry, hard failures, health check, and generate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the coreAiBackend module
const mockInvoke = vi.fn();
const mockGenerate = vi.fn();
const mockHealth = vi.fn();

vi.mock('./lib/coreAiBackend', () => ({
  getCoreAIBackend: vi.fn(() => ({
    invoke: mockInvoke,
    generate: mockGenerate,
    health: mockHealth,
  })),
}));

// Import after mocking
import { aiInvoke, aiGenerate, aiHealthCheck, getProviderStatus } from './lib/aiProvider';
import type { InvokeParams } from './_core/llm';

const SAMPLE_PARAMS: InvokeParams = {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Say hello' },
  ],
};

const SAMPLE_RESULT = {
  id: 'coreai-123',
  created: Date.now(),
  model: 'llama-3.3-70b-versatile',
  choices: [
    {
      index: 0,
      message: { role: 'assistant' as const, content: 'Hello!' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
};

describe('aiInvoke — Core AI Backend Only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on successful first call', async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_RESULT);

    const result = await aiInvoke(SAMPLE_PARAMS);

    expect(result).toEqual(SAMPLE_RESULT);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith(SAMPLE_PARAMS);
  });

  it('retries once on transient 504 error and succeeds', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 504: gateway timeout'))
      .mockResolvedValueOnce(SAMPLE_RESULT);

    const result = await aiInvoke(SAMPLE_PARAMS);

    expect(result).toEqual(SAMPLE_RESULT);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('retries once on timeout error and succeeds', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockResolvedValueOnce(SAMPLE_RESULT);

    const result = await aiInvoke(SAMPLE_PARAMS);

    expect(result).toEqual(SAMPLE_RESULT);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('retries once on ECONNREFUSED and succeeds', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'))
      .mockResolvedValueOnce(SAMPLE_RESULT);

    const result = await aiInvoke(SAMPLE_PARAMS);

    expect(result).toEqual(SAMPLE_RESULT);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-transient 400 error (no retry)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Core AI returned 400: bad request'));

    await expect(aiInvoke(SAMPLE_PARAMS)).rejects.toThrow('400');
    expect(mockInvoke).toHaveBeenCalledTimes(1); // No retry
  });

  it('throws immediately on non-transient 422 error (no retry)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Core AI returned 422: validation error'));

    await expect(aiInvoke(SAMPLE_PARAMS)).rejects.toThrow('422');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('throws after retry failure on transient error', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 502: bad gateway'))
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 503: service unavailable'));

    await expect(aiInvoke(SAMPLE_PARAMS)).rejects.toThrow('Core AI Backend failed after retry');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('does not fall back to Manus Forge — only Core AI Backend is used', async () => {
    // Verify there is no invokeLLM import or fallback
    mockInvoke.mockRejectedValueOnce(new Error('Core AI /v1/chat returned 500: internal error'))
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 500: still down'));

    await expect(aiInvoke(SAMPLE_PARAMS)).rejects.toThrow('Core AI Backend failed after retry');
    // Only 2 calls (original + 1 retry), no third-party fallback
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

describe('aiGenerate — simple text generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns generated text from Core AI Backend', async () => {
    mockGenerate.mockResolvedValueOnce({ text: 'Generated response', model: 'llamacpp_ip' });

    const result = await aiGenerate('Write a haiku');

    expect(result).toBe('Generated response');
    expect(mockGenerate).toHaveBeenCalledWith({ prompt: 'Write a haiku', system_prompt: undefined });
  });

  it('passes system prompt to generate', async () => {
    mockGenerate.mockResolvedValueOnce({ text: 'Expert response', model: 'llamacpp_ip' });

    await aiGenerate('Analyze BRNT', 'You are a financial analyst');

    expect(mockGenerate).toHaveBeenCalledWith({
      prompt: 'Analyze BRNT',
      system_prompt: 'You are a financial analyst',
    });
  });
});

describe('aiHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns healthy status when Core AI Backend is up', async () => {
    mockHealth.mockResolvedValueOnce({ status: 'healthy', version: '3.1.0' });

    const result = await aiHealthCheck();

    expect(result.healthy).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.version).toBe('3.1.0');
  });

  it('returns unhealthy status when Core AI Backend is down', async () => {
    mockHealth.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await aiHealthCheck();

    expect(result.healthy).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

describe('getProviderStatus', () => {
  it('reports core_ai_backend as the active provider', () => {
    const status = getProviderStatus();

    expect(status.activeProvider).toBe('core_ai_backend');
    expect(status.coreAiUrl).toContain('ai.s9n.dxb-gw.basanti.ai');
  });

  it('does not mention Manus Forge in provider status', () => {
    const status = getProviderStatus();

    // No fallback provider should be mentioned
    expect(JSON.stringify(status)).not.toContain('manus');
    expect(JSON.stringify(status)).not.toContain('forge');
  });
});
