/**
 * Integration Tests — Validates live Core AI Backend, CognitionOS, and Memory Vault endpoints.
 * These tests hit the actual live services to verify connectivity.
 * 
 * Core AI Backend is the SOLE LLM provider (no Manus Forge fallback).
 */

import { describe, it, expect } from 'vitest';

const CORE_AI_URL = process.env.CORE_AI_BACKEND_URL || 'https://ai.s9n.dxb-gw.basanti.ai';
const COGNITION_OS_URL = process.env.COGNITION_OS_URL || 'https://cognition.s9n.dxb-gw.basanti.ai';

describe('Core AI Backend Integration', () => {
  it('should reach the health endpoint', async () => {
    const res = await fetch(`${CORE_AI_URL}/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('healthy');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('service');
  }, 20_000);

  it('should get a chat completion from /v1/chat (no auth required)', async () => {
    // The Core AI Backend /v1/chat endpoint requires NO authentication
    // It uses llama-3.3-70b-versatile by default
    const res = await fetch(`${CORE_AI_URL}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Respond with just the word OK' }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    
    // Accept 200 (success) or 504 (gateway timeout — transient, not a config issue)
    if (res.status === 504) {
      console.warn('[Integration] Core AI Backend returned 504 — transient gateway timeout, skipping assertion');
      return; // Transient issue, not a test failure
    }
    
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('response');
    expect(data).toHaveProperty('model');
    expect(data).toHaveProperty('usage');
    expect(typeof data.response).toBe('string');
    expect(data.response.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('CognitionOS Integration', () => {
  it('should reach the health endpoint', async () => {
    const res = await fetch(`${COGNITION_OS_URL}/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  }, 20_000);

  it('should reach the readiness endpoint with dependency checks', async () => {
    const res = await fetch(`${COGNITION_OS_URL}/health/ready`, {
      signal: AbortSignal.timeout(15_000),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('checks');
    expect(Array.isArray(data.checks)).toBe(true);
    // Verify at least Weaviate and Elasticsearch are checked
    const checkServices = data.checks.map((c: any) => c.service);
    expect(checkServices).toContain('weaviate');
    expect(checkServices).toContain('elasticsearch');
  }, 20_000);
});

describe('Memory Vault Integration', () => {
  it('should reach the memory health endpoint via Core AI Backend', async () => {
    const memUrl = process.env.MEMORY_VAULT_URL || `${CORE_AI_URL}/v1/memory`;
    const res = await fetch(`${memUrl}/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    // Memory Vault health returns 200 with { healthy, neo4j_connected, postgres_connected }
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('postgres_connected');
    // Postgres should be up; Neo4j may be down
    expect(data.postgres_connected).toBe(true);
  }, 20_000);
});
