/**
 * CognitionOS Adapter
 * 
 * Connects to the SeKondBrain CognitionOS knowledge graph
 * (cognition.s9n.dxb-gw.basanti.ai) for:
 * - Storing portfolio concepts (positions, watchlist, trades)
 * - Querying knowledge graph for context enrichment in AI analysis
 * - Retrieving related concepts for Kora chat context injection
 * 
 * Environment variables:
 *   COGNITION_OS_URL       — e.g. https://cognition.s9n.dxb-gw.basanti.ai:3007
 *   COGNITION_OS_TENANT_ID — tenant UUID from provisioning
 */

/* ─── Types ─── */

export interface Concept {
  id?: string;
  name: string;
  type: string;
  description?: string;
  properties?: Record<string, unknown>;
  relationships?: Array<{
    targetConceptId: string;
    relationshipType: string;
    weight?: number;
  }>;
}

export interface ConceptQueryResult {
  concepts: Concept[];
  totalCount: number;
}

export interface KnowledgeContext {
  relatedConcepts: Concept[];
  summary: string;
  confidence: number;
}

/* ─── Configuration ─── */

function getConfig() {
  return {
    baseUrl: (process.env.COGNITION_OS_URL || '').replace(/\/$/, ''),
    tenantId: process.env.COGNITION_OS_TENANT_ID || '',
  };
}

export function isCognitionOSConfigured(): boolean {
  const config = getConfig();
  return !!(config.baseUrl && config.tenantId);
}

/* ─── Concept CRUD ─── */

/**
 * Store or update a concept in the knowledge graph.
 */
export async function storeConcept(concept: Concept): Promise<string | null> {
  const config = getConfig();
  if (!config.baseUrl || !config.tenantId) {
    console.warn('[CognitionOS] Not configured, skipping concept store');
    return null;
  }

  try {
    const res = await fetch(`${config.baseUrl}/api/v1/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': config.tenantId,
      },
      body: JSON.stringify(concept),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[CognitionOS] Store concept failed: HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { id?: string; concept_id?: string };
    return data.id || data.concept_id || null;
  } catch (err) {
    console.warn('[CognitionOS] Store concept error:', err);
    return null;
  }
}

/**
 * Query concepts from the knowledge graph by type or search term.
 */
export async function queryConcepts(
  query: string,
  type?: string,
  limit: number = 10,
): Promise<ConceptQueryResult> {
  const config = getConfig();
  if (!config.baseUrl || !config.tenantId) {
    return { concepts: [], totalCount: 0 };
  }

  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (type) params.set('type', type);

    const res = await fetch(`${config.baseUrl}/api/v1/concepts/search?${params}`, {
      headers: { 'X-Tenant-ID': config.tenantId },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { concepts: [], totalCount: 0 };
    }

    const data = (await res.json()) as {
      concepts?: Concept[];
      results?: Concept[];
      total?: number;
    };

    const concepts = data.concepts || data.results || [];
    return { concepts, totalCount: data.total || concepts.length };
  } catch (err) {
    console.warn('[CognitionOS] Query concepts error:', err);
    return { concepts: [], totalCount: 0 };
  }
}

/**
 * Get a specific concept by ID.
 */
export async function getConceptById(conceptId: string): Promise<Concept | null> {
  const config = getConfig();
  if (!config.baseUrl || !config.tenantId) return null;

  try {
    const res = await fetch(`${config.baseUrl}/api/v1/concepts/${conceptId}`, {
      headers: { 'X-Tenant-ID': config.tenantId },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    return (await res.json()) as Concept;
  } catch {
    return null;
  }
}

/* ─── Knowledge Context for AI Enrichment ─── */

/**
 * Build enriched context from the knowledge graph for a given instrument.
 * This is injected into AI analysis and Kora chat prompts.
 */
export async function getKnowledgeContext(
  symbol: string,
  additionalTerms: string[] = [],
): Promise<KnowledgeContext> {
  const config = getConfig();
  if (!config.baseUrl || !config.tenantId) {
    return { relatedConcepts: [], summary: '', confidence: 0 };
  }

  try {
    // Query for the instrument itself and related concepts
    const queries = [symbol, ...additionalTerms.slice(0, 3)];
    const allConcepts: Concept[] = [];

    for (const q of queries) {
      const result = await queryConcepts(q, undefined, 5);
      allConcepts.push(...result.concepts);
    }

    // Deduplicate by concept name
    const seen = new Set<string>();
    const uniqueConcepts = allConcepts.filter((c) => {
      const key = c.name?.toLowerCase() || '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Build a text summary of the knowledge context
    const summaryParts = uniqueConcepts.map((c) => {
      const props = c.properties
        ? Object.entries(c.properties)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : '';
      return `[${c.type}] ${c.name}${c.description ? ': ' + c.description : ''}${props ? ' (' + props + ')' : ''}`;
    });

    return {
      relatedConcepts: uniqueConcepts,
      summary: summaryParts.join('\n'),
      confidence: uniqueConcepts.length > 0 ? 70 : 0,
    };
  } catch (err) {
    console.warn('[CognitionOS] Knowledge context error:', err);
    return { relatedConcepts: [], summary: '', confidence: 0 };
  }
}

/* ─── Portfolio Concept Sync ─── */

/**
 * Sync a portfolio position to the knowledge graph.
 */
export async function syncPortfolioConcept(position: {
  symbol: string;
  name: string;
  quantity: number;
  entryPrice: number;
  currentPrice?: number;
  exchange?: string;
  type: 'equity' | 'forex' | 'commodity' | 'etf';
  openedDate?: string;
}): Promise<string | null> {
  return storeConcept({
    name: position.symbol,
    type: 'portfolio_position',
    description: `${position.name} — ${position.quantity} units @ ${position.entryPrice}`,
    properties: {
      symbol: position.symbol,
      instrumentName: position.name,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      currentPrice: position.currentPrice,
      exchange: position.exchange,
      assetType: position.type,
      openedDate: position.openedDate,
      lastSyncedAt: new Date().toISOString(),
    },
  });
}

/**
 * Sync a watchlist item to the knowledge graph.
 */
export async function syncWatchlistConcept(item: {
  symbol: string;
  name: string;
  currentPrice?: number;
}): Promise<string | null> {
  return storeConcept({
    name: item.symbol,
    type: 'watchlist_item',
    description: `Watchlist: ${item.name}`,
    properties: {
      symbol: item.symbol,
      instrumentName: item.name,
      currentPrice: item.currentPrice,
      lastSyncedAt: new Date().toISOString(),
    },
  });
}

/* ─── Health Check ─── */

export async function cognitionOSHealthCheck(): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  const config = getConfig();
  if (!config.baseUrl) {
    return { available: false, error: 'COGNITION_OS_URL not set' };
  }

  try {
    const res = await fetch(`${config.baseUrl}/api/health`, {
      headers: { 'X-Tenant-ID': config.tenantId },
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
