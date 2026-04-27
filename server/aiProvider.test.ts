/**
 * AI Provider Unit Tests — Core AI Backend + Manus Forge Fallback
 * 
 * Tests the unified AI provider with Core AI Backend as primary
 * and Manus Forge (/v1/chat/completions) as emergency fallback.
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

// Mock global fetch for Forge fallback calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

const FORGE_RESULT = {
  id: 'forge-456',
  created: Date.now(),
  model: 'gemini-2.5-flash',
  choices: [
    {
      index: 0,
      message: { role: 'assistant' as const, content: 'Hello from Forge!' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
};

describe('aiInvoke — Core AI Backend + Forge Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on successful first call (no Forge needed)', async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_RESULT);

    const result = await aiInvoke(SAMPLE_PARAMS);

    expect(result).toEqual(SAMPLE_RESULT);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled(); // Forge not called
  });

  it('retries once on transient 504 error and succeeds', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 504: gateway timeout'))
      .mockResolvedValueOnce(SAMPLE_RESULT);

    const result = await aiInvoke(SAMPLE_PARAMS);

    expect(result).toEqual(SAMPLE_RESULT);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockFetch).not.toHaveBeenCalled(); // Forge not needed
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

  it('throws immediately on non-transient 400 error (no retry, no Forge)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Core AI returned 400: bad request'));

    await expect(aiInvoke(SAMPLE_PARAMS)).rejects.toThrow('400');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws immediately on non-transient 422 error (no retry, no Forge)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Core AI returned 422: validation error'));

    await expect(aiInvoke(SAMPLE_PARAMS)).rejects.toThrow('422');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('falls back to Manus Forge when Core AI fails twice on transient error', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 502: bad gateway'))
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 503: service unavailable'));

    // Mock Forge fetch to succeed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => FORGE_RESULT,
    });

    const result = await aiInvoke(SAMPLE_PARAMS);

    expect(result).toEqual(FORGE_RESULT);
    expect(mockInvoke).toHaveBeenCalledTimes(2); // Core AI tried twice
    expect(mockFetch).toHaveBeenCalledTimes(1); // Forge called once
    // Verify Forge was called with correct URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat/completions'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when both Core AI and Forge fail', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 500: internal error'))
      .mockRejectedValueOnce(new Error('Core AI /v1/chat returned 500: still down'));

    // Mock Forge fetch to also fail
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Forge internal error',
    });

    await expect(aiInvoke(SAMPLE_PARAMS)).rejects.toThrow('All LLM providers failed');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
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
  it('reports provider status with Forge availability', () => {
    const status = getProviderStatus();

    expect(status.coreAiUrl).toContain('ai.s9n.dxb-gw.basanti.ai');
    expect(typeof status.forgeFallbackAvailable).toBe('boolean');
    expect(typeof status.healthy).toBe('boolean');
    expect(typeof status.consecutiveFailures).toBe('number');
  });

  it('includes activeProvider field', () => {
    const status = getProviderStatus();

    // activeProvider should be either core_ai_backend or manus_forge
    expect(['core_ai_backend', 'manus_forge']).toContain(status.activeProvider);
  });
});
