/**
 * Memory Vault Client
 * 
 * Client for the Memory Vault service exposed via Core AI Backend at /v1/memory/.
 * Built from the actual memory.py router and schemas in Core_Ai_Backend repo.
 * 
 * Base URL: https://dxb-gw.basanti.ai:3006/v1/memory
 * Auth: JWT Bearer token (org_id and user_id extracted from JWT)
 * 
 * Note: Neo4j is currently down on the live instance, so episode storage
 * falls back to Postgres-only mode. The client handles this gracefully.
 */

/* ─── Types ─── */

export interface MemoryVaultConfig {
  baseUrl: string;      // e.g. https://dxb-gw.basanti.ai:3006/v1/memory
  authToken?: string;   // JWT Bearer token
}

export interface EpisodeCreateRequest {
  content: string;
  summary?: string;
  timestamp?: string;   // ISO 8601
  user_id?: string;
  project_id?: string;
  extra_metadata?: Record<string, any>;
  org_id?: string;
}

export interface EpisodeResponse {
  id: string;
  summary: string;
  content: string;
  timestamp: string;
  user_id?: string;
  project_id?: string;
  extra_metadata?: Record<string, any>;
}

export interface FactCreateRequest {
  fact_type: string;    // e.g. 'trade_signal', 'market_observation', 'portfolio_change'
  content: string;
  valid_from?: string;  // ISO 8601
  valid_to?: string;    // ISO 8601
  metadata?: Record<string, any>;
}

export interface FactsCreateRequest {
  facts: FactCreateRequest[];
  org_id?: string;
}

export interface SearchRequest {
  query?: string;
  limit?: number;       // 1-100, default 10
  timestamp_start?: string;
  timestamp_end?: string;
  user_id?: string;
  project_id?: string;
  org_id?: string;
}

export interface SearchResponse {
  episodes: EpisodeResponse[];
}

/* ─── Client ─── */

export class MemoryVaultClient {
  private config: MemoryVaultConfig;
  private timeout = 15_000;

  constructor(config: MemoryVaultConfig) {
    this.config = config;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.authToken) {
      h['Authorization'] = `Bearer ${this.config.authToken}`;
    }
    return h;
  }

  private async post<T = any>(path: string, body: Record<string, any>): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`MemoryVault ${path} returned ${res.status}: ${text}`);
      }

      return await res.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async get<T = any>(path: string): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`MemoryVault GET ${path} returned ${res.status}: ${text}`);
      }

      return await res.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ─── Health ─── */

  async health(): Promise<{ healthy: boolean; neo4j_connected: boolean; postgres_connected: boolean }> {
    return this.get('/health');
  }

  /* ─── Episodes ─── */

  async createEpisode(params: EpisodeCreateRequest): Promise<{ episode_id: string }> {
    return this.post('/episodes', params);
  }

  async getEpisode(episodeId: string): Promise<EpisodeResponse> {
    return this.get(`/episodes/${episodeId}`);
  }

  /* ─── Facts ─── */

  async createFacts(params: FactsCreateRequest): Promise<{ created: number }> {
    return this.post('/facts', params);
  }

  /* ─── Search ─── */

  async search(params: SearchRequest): Promise<SearchResponse> {
    return this.post('/search', params);
  }

  /* ─── Convenience: Store a trading episode ─── */

  async storeTradeEpisode(params: {
    symbol: string;
    action: string;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<{ episode_id: string }> {
    return this.createEpisode({
      content: params.content,
      summary: `${params.action} analysis for ${params.symbol}`,
      extra_metadata: {
        type: 'trade_analysis',
        symbol: params.symbol,
        action: params.action,
        ...params.metadata,
      },
    });
  }

  /* ─── Convenience: Store a market fact ─── */

  async storeMarketFact(params: {
    factType: string;
    content: string;
    symbol?: string;
    metadata?: Record<string, any>;
  }): Promise<{ created: number }> {
    return this.createFacts({
      facts: [{
        fact_type: params.factType,
        content: params.content,
        metadata: {
          symbol: params.symbol,
          ...params.metadata,
        },
      }],
    });
  }

  /* ─── Convenience: Recall recent analysis for a symbol ─── */

  async recallAnalysis(symbol: string, limit = 5): Promise<EpisodeResponse[]> {
    const result = await this.search({
      query: `${symbol} analysis recommendation`,
      limit,
    });
    return result.episodes || [];
  }
}

/* ─── Singleton Factory ─── */

let _instance: MemoryVaultClient | null = null;

export function getMemoryVault(): MemoryVaultClient {
  if (!_instance) {
    const baseUrl = process.env.MEMORY_VAULT_URL || 'https://ai.s9n.dxb-gw.basanti.ai/v1/memory';
    const authToken = process.env.MEMORY_VAULT_AUTH_TOKEN || process.env.CORE_AI_BACKEND_API_KEY || '';

    _instance = new MemoryVaultClient({ baseUrl, authToken });
  }
  return _instance;
}

/** Reset singleton (for testing) */
export function resetMemoryVault(): void {
  _instance = null;
}
