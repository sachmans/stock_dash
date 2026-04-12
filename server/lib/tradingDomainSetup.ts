/**
 * Trading Domain Setup for CognitionOS
 * 
 * Seeds the knowledge graph with a trading domain hierarchy:
 * 
 *   SuperRoot (stock_dash)
 *     └── Market (root concept)
 *           ├── Equities
 *           │     └── BRNT (Brent Crude Oil)
 *           ├── Forex
 *           │     └── USDCHF (USD/CHF)
 *           ├── Commodities
 *           │     ├── Gold (GC=F)
 *           │     └── Silver (SI=F)
 *           └── Regional
 *                 └── DEWA (Dubai Electricity & Water)
 * 
 * The setup is idempotent — calling it multiple times will not create duplicates
 * because CognitionOS super-root creation is idempotent and concept creation
 * uses consistent naming.
 */

import { getCognitionOS, type CognitionOSClient } from './cognitionOSClient';

/* ─── Seed Data ─── */

interface SeedConcept {
  name: string;
  description: string;
  domain: string;
  children?: SeedConcept[];
}

const SEED_HIERARCHY: SeedConcept = {
  name: 'Financial Markets',
  description: 'Root concept for all financial market instruments, analysis, and trading strategies tracked by the portfolio system.',
  domain: 'finance',
  children: [
    {
      name: 'Equities',
      description: 'Stock and equity instruments including individual stocks, ETFs, and equity indices.',
      domain: 'finance.equities',
      children: [
        {
          name: 'BRNT - Brent Crude Oil',
          description: 'Brent Crude Oil futures (BRNT.L). Key benchmark for global oil pricing. Position: 250 units @ 78.660.',
          domain: 'finance.equities.commodities',
        },
      ],
    },
    {
      name: 'Forex',
      description: 'Foreign exchange currency pairs and cross-rates.',
      domain: 'finance.forex',
      children: [
        {
          name: 'USDCHF - US Dollar / Swiss Franc',
          description: 'USD/CHF currency pair. Active positions: Trade 1 (11 Feb 2026, 100k @ 0.767501), Trade 2 (25 Mar 2026, 200k @ 0.79075).',
          domain: 'finance.forex.majors',
        },
      ],
    },
    {
      name: 'Commodities',
      description: 'Physical commodity futures and spot prices.',
      domain: 'finance.commodities',
      children: [
        {
          name: 'Gold (GC=F)',
          description: 'Gold futures contract. Safe-haven asset and inflation hedge. Watchlist item.',
          domain: 'finance.commodities.precious_metals',
        },
        {
          name: 'Silver (SI=F)',
          description: 'Silver futures contract. Industrial and precious metal. Watchlist item.',
          domain: 'finance.commodities.precious_metals',
        },
      ],
    },
    {
      name: 'Regional Markets',
      description: 'Region-specific equities and instruments.',
      domain: 'finance.regional',
      children: [
        {
          name: 'DEWA - Dubai Electricity and Water Authority',
          description: 'DEWA (Dubai Electricity & Water Authority) listed on DFM. Watchlist item.',
          domain: 'finance.regional.uae',
        },
      ],
    },
    {
      name: 'Trading Strategies',
      description: 'Trading methodologies, strategies, and approaches used for portfolio management.',
      domain: 'finance.strategies',
      children: [
        {
          name: 'Technical Analysis',
          description: 'Chart patterns, indicators (RSI, MACD, Bollinger Bands, SMA), and price action analysis.',
          domain: 'finance.strategies.technical',
        },
        {
          name: 'Fundamental Analysis',
          description: 'Macro factors, sector trends, valuation, and supply/demand dynamics.',
          domain: 'finance.strategies.fundamental',
        },
        {
          name: 'Sentiment Analysis',
          description: 'News sentiment scoring, market mood assessment, and social media analysis.',
          domain: 'finance.strategies.sentiment',
        },
        {
          name: 'Risk Management',
          description: 'Position sizing, stop-loss strategies, portfolio diversification, and drawdown management.',
          domain: 'finance.strategies.risk',
        },
      ],
    },
    {
      name: 'Market Events',
      description: 'Significant market events, news, and catalysts that affect portfolio instruments.',
      domain: 'finance.events',
    },
  ],
};

/* ─── Setup Functions ─── */

interface SetupResult {
  success: boolean;
  superRootId?: string;
  conceptsCreated: number;
  relationshipsCreated: number;
  errors: string[];
}

/**
 * Recursively seed concepts into CognitionOS.
 * Returns a map of concept name -> concept ID for relationship building.
 */
async function seedConcepts(
  client: CognitionOSClient,
  concept: SeedConcept,
  parentId: string | undefined,
  result: SetupResult,
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();

  try {
    const response = await client.addConcept({
      name: concept.name,
      description: concept.description,
      parentId,
      knowledgeDomain: concept.domain,
      confidence: 1.0,
    });

    const conceptId = response.id;
    idMap.set(concept.name, conceptId);
    result.conceptsCreated++;

    console.log(`[DomainSetup] Created concept: ${concept.name} (${conceptId})`);

    // Seed children recursively
    if (concept.children) {
      for (const child of concept.children) {
        const childMap = await seedConcepts(client, child, conceptId, result);
        childMap.forEach((v, k) => idMap.set(k, v));
      }
    }
  } catch (err: any) {
    const msg = `Failed to create concept "${concept.name}": ${err.message}`;
    console.error(`[DomainSetup] ${msg}`);
    result.errors.push(msg);
  }

  return idMap;
}

/**
 * Create cross-cutting relationships between concepts.
 * E.g., Trading Strategies RELATED_TO specific instruments.
 */
async function seedRelationships(
  client: CognitionOSClient,
  idMap: Map<string, string>,
  result: SetupResult,
): Promise<void> {
  const relationships: Array<{ source: string; target: string; relType: 'RELATED_TO' | 'SUPPORTS' | 'DEPENDS_ON' }> = [
    // Strategies relate to instruments
    { source: 'Technical Analysis', target: 'BRNT - Brent Crude Oil', relType: 'RELATED_TO' },
    { source: 'Technical Analysis', target: 'USDCHF - US Dollar / Swiss Franc', relType: 'RELATED_TO' },
    { source: 'Fundamental Analysis', target: 'BRNT - Brent Crude Oil', relType: 'RELATED_TO' },
    { source: 'Sentiment Analysis', target: 'Market Events', relType: 'SUPPORTS' },
    { source: 'Risk Management', target: 'Forex', relType: 'RELATED_TO' },
    { source: 'Risk Management', target: 'Equities', relType: 'RELATED_TO' },
    // Commodities relationships
    { source: 'Gold (GC=F)', target: 'Silver (SI=F)', relType: 'RELATED_TO' },
    { source: 'BRNT - Brent Crude Oil', target: 'Commodities', relType: 'RELATED_TO' },
  ];

  for (const rel of relationships) {
    const sourceId = idMap.get(rel.source);
    const targetId = idMap.get(rel.target);

    if (!sourceId || !targetId) {
      result.errors.push(`Skipped relationship ${rel.source} -> ${rel.target}: missing node ID`);
      continue;
    }

    try {
      await client.createRelationship({
        sourceId,
        targetId,
        relType: rel.relType,
      });
      result.relationshipsCreated++;
      console.log(`[DomainSetup] Created relationship: ${rel.source} -[${rel.relType}]-> ${rel.target}`);
    } catch (err: any) {
      result.errors.push(`Failed relationship ${rel.source} -> ${rel.target}: ${err.message}`);
    }
  }
}

/**
 * Index all seed concepts into Weaviate for semantic search.
 */
async function indexConceptsForSearch(
  client: CognitionOSClient,
  idMap: Map<string, string>,
  result: SetupResult,
): Promise<void> {
  const entries: Array<[string, string]> = [];
  idMap.forEach((v, k) => entries.push([k, v]));
  const entities = entries.map(([name, id]) => {
    const concept = findConcept(SEED_HIERARCHY, name);
    return {
      entityId: id,
      name,
      description: concept?.description || name,
      nodeType: 'Concept' as const,
      contentType: 'concept',
    };
  });

  try {
    await client.vectorBatchIndex(entities);
    console.log(`[DomainSetup] Indexed ${entities.length} concepts for vector search`);
  } catch (err: any) {
    result.errors.push(`Vector batch index failed: ${err.message}`);
    console.error(`[DomainSetup] Vector batch index failed:`, err.message);
  }
}

function findConcept(root: SeedConcept, name: string): SeedConcept | undefined {
  if (root.name === name) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findConcept(child, name);
      if (found) return found;
    }
  }
  return undefined;
}

/* ─── Main Entry Point ─── */

/**
 * Set up the trading domain in CognitionOS.
 * Idempotent — safe to call multiple times.
 */
export async function setupTradingDomain(): Promise<SetupResult> {
  const result: SetupResult = {
    success: false,
    conceptsCreated: 0,
    relationshipsCreated: 0,
    errors: [],
  };

  const client = getCognitionOS();

  try {
    // Step 1: Create SuperRoot (idempotent)
    console.log('[DomainSetup] Creating SuperRoot...');
    const superRoot = await client.createSuperRoot(
      process.env.COGNITION_OS_TENANT_ID || 'stock_dash',
      'concept',
    );
    result.superRootId = superRoot.id;
    console.log(`[DomainSetup] SuperRoot: ${superRoot.id}`);

    // Step 2: Seed concept hierarchy
    console.log('[DomainSetup] Seeding concept hierarchy...');
    const idMap = await seedConcepts(client, SEED_HIERARCHY, superRoot.id, result);

    // Step 3: Create cross-cutting relationships
    console.log('[DomainSetup] Creating relationships...');
    await seedRelationships(client, idMap, result);

    // Step 4: Index for vector search
    console.log('[DomainSetup] Indexing for vector search...');
    await indexConceptsForSearch(client, idMap, result);

    result.success = result.errors.length === 0;
    console.log(`[DomainSetup] Complete: ${result.conceptsCreated} concepts, ${result.relationshipsCreated} relationships, ${result.errors.length} errors`);
  } catch (err: any) {
    result.errors.push(`Setup failed: ${err.message}`);
    console.error('[DomainSetup] Fatal error:', err);
  }

  return result;
}

/**
 * Get the current domain status from CognitionOS.
 */
export async function getDomainStatus(): Promise<{
  healthy: boolean;
  services: Record<string, string>;
  graphReady: boolean;
}> {
  const client = getCognitionOS();

  try {
    const readiness = await client.healthReady();
    const services: Record<string, string> = {};
    let graphReady = true;

    for (const check of readiness.checks) {
      services[check.service] = `${check.status} (${check.latency_ms}ms)`;
      if (check.service === 'falkordb' && check.status !== 'up') {
        graphReady = false;
      }
    }

    return {
      healthy: readiness.status === 'healthy',
      services,
      graphReady,
    };
  } catch (err: any) {
    return {
      healthy: false,
      services: { error: err.message },
      graphReady: false,
    };
  }
}
