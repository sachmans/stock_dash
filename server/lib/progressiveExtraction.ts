/**
 * Progressive Extraction Pipeline
 * 
 * Enriches AI analysis with accumulated knowledge from CognitionOS and Memory Vault.
 * Each analysis cycle extracts more context from the knowledge graph, building
 * progressively richer understanding over time.
 * 
 * Architecture:
 * 1. Before analysis: Query CognitionOS for related concepts + past reasoning nodes
 * 2. Before analysis: Query Memory Vault for past episodes + facts about the symbol
 * 3. Inject extracted context into the AI analysis prompts
 * 4. After analysis: Push results back into CognitionOS + Memory Vault (via ingestion modules)
 * 
 * This creates a virtuous cycle:
 *   Analyze → Extract → Enrich → Analyze (with more context) → Extract (deeper) → ...
 */

import { getCognitionOS } from './cognitionOSClient';
import { getMemoryVault } from './memoryVaultClient';

/* ─── Types ─── */

export interface ExtractionContext {
  /** Related concepts from the knowledge graph */
  relatedConcepts: Array<{ name: string; description: string; score: number }>;
  /** Past reasoning nodes (decisions, observations) */
  pastDecisions: Array<{ name: string; description: string; score: number }>;
  /** Past analysis episodes from Memory Vault */
  pastEpisodes: Array<{ summary: string; content: string; timestamp: string }>;
  /** Known facts about the symbol */
  knownFacts: Array<{ content: string; factType: string }>;
  /** Formatted context string ready to inject into prompts */
  formattedContext: string;
  /** Extraction metadata */
  meta: {
    conceptCount: number;
    decisionCount: number;
    episodeCount: number;
    factCount: number;
    extractionTimeMs: number;
  };
}

/* ─── Extraction Functions ─── */

/**
 * Extract progressive context for a symbol from CognitionOS and Memory Vault.
 * This is the main entry point — call before running AI analysis.
 */
export async function extractContext(
  symbol: string,
  instrumentName: string,
): Promise<ExtractionContext> {
  const startTime = Date.now();

  const context: ExtractionContext = {
    relatedConcepts: [],
    pastDecisions: [],
    pastEpisodes: [],
    knownFacts: [],
    formattedContext: '',
    meta: {
      conceptCount: 0,
      decisionCount: 0,
      episodeCount: 0,
      factCount: 0,
      extractionTimeMs: 0,
    },
  };

  // Run all extractions in parallel for speed
  const [concepts, decisions, episodes] = await Promise.allSettled([
    extractRelatedConcepts(symbol, instrumentName),
    extractPastDecisions(symbol, instrumentName),
    extractPastEpisodes(symbol),
  ]);

  if (concepts.status === 'fulfilled') {
    context.relatedConcepts = concepts.value;
    context.meta.conceptCount = concepts.value.length;
  }

  if (decisions.status === 'fulfilled') {
    context.pastDecisions = decisions.value;
    context.meta.decisionCount = decisions.value.length;
  }

  if (episodes.status === 'fulfilled') {
    context.pastEpisodes = episodes.value.episodes;
    context.knownFacts = episodes.value.facts;
    context.meta.episodeCount = episodes.value.episodes.length;
    context.meta.factCount = episodes.value.facts.length;
  }

  // Format into a prompt-ready context block
  context.formattedContext = formatContextForPrompt(context, symbol, instrumentName);
  context.meta.extractionTimeMs = Date.now() - startTime;

  console.log(`[ProgressiveExtraction] ${symbol}: ${context.meta.conceptCount} concepts, ${context.meta.decisionCount} decisions, ${context.meta.episodeCount} episodes, ${context.meta.factCount} facts in ${context.meta.extractionTimeMs}ms`);

  return context;
}

/**
 * Extract related concepts from CognitionOS knowledge graph.
 */
async function extractRelatedConcepts(
  symbol: string,
  instrumentName: string,
): Promise<Array<{ name: string; description: string; score: number }>> {
  try {
    const cogOS = getCognitionOS();
    const results = await cogOS.vectorSearch(
      `${instrumentName} ${symbol} trading analysis market`,
      8,
      0.25,
    );
    return results.map(r => ({
      name: r.name,
      description: r.description,
      score: r.score,
    }));
  } catch (err: any) {
    console.error('[ProgressiveExtraction] Concept search failed:', err.message);
    return [];
  }
}

/**
 * Extract past reasoning decisions from CognitionOS.
 */
async function extractPastDecisions(
  symbol: string,
  instrumentName: string,
): Promise<Array<{ name: string; description: string; score: number }>> {
  try {
    const cogOS = getCognitionOS();
    const results = await cogOS.vectorSearch(
      `${symbol} recommendation verdict buy sell hold decision`,
      5,
      0.3,
    );
    return results.map(r => ({
      name: r.name,
      description: r.description,
      score: r.score,
    }));
  } catch (err: any) {
    console.error('[ProgressiveExtraction] Decision search failed:', err.message);
    return [];
  }
}

/**
 * Extract past episodes and facts from Memory Vault.
 */
async function extractPastEpisodes(
  symbol: string,
): Promise<{
  episodes: Array<{ summary: string; content: string; timestamp: string }>;
  facts: Array<{ content: string; factType: string }>;
}> {
  try {
    const memVault = getMemoryVault();

    // Search for past analysis episodes
    const searchResult = await memVault.search({
      query: `${symbol} analysis recommendation`,
      limit: 5,
    });

    const episodes = (searchResult.episodes || []).map(ep => ({
      summary: ep.summary || '',
      content: ep.content || '',
      timestamp: ep.timestamp || '',
    }));

    // Also search for known facts
    let facts: Array<{ content: string; factType: string }> = [];
    try {
      const factSearch = await memVault.search({
        query: `${symbol} trade signal price target risk`,
        limit: 10,
      });
      // Facts come back as episodes in the unified search
      facts = (factSearch.episodes || []).map(ep => ({
        content: ep.summary || ep.content || '',
        factType: (ep.extra_metadata as any)?.type || 'general',
      }));
    } catch {
      // Facts search is optional
    }

    return { episodes, facts };
  } catch (err: any) {
    console.error('[ProgressiveExtraction] Episode search failed:', err.message);
    return { episodes: [], facts: [] };
  }
}

/* ─── Context Formatting ─── */

/**
 * Format extracted context into a prompt-ready string.
 * This gets injected into AI analysis system prompts.
 */
function formatContextForPrompt(
  ctx: ExtractionContext,
  symbol: string,
  instrumentName: string,
): string {
  const sections: string[] = [];

  // Knowledge graph context
  if (ctx.relatedConcepts.length > 0) {
    sections.push(
      `=== Knowledge Graph Context for ${instrumentName} (${symbol}) ===`,
      ...ctx.relatedConcepts.map(c =>
        `• ${c.name}: ${c.description.slice(0, 200)} (relevance: ${(c.score * 100).toFixed(0)}%)`
      ),
    );
  }

  // Past decisions
  if (ctx.pastDecisions.length > 0) {
    sections.push(
      '',
      `=== Previous Analysis Decisions ===`,
      ...ctx.pastDecisions.map(d =>
        `• ${d.name}: ${d.description.slice(0, 300)}`
      ),
    );
  }

  // Past episodes from memory
  if (ctx.pastEpisodes.length > 0) {
    sections.push(
      '',
      `=== Analysis History (Memory Vault) ===`,
      ...ctx.pastEpisodes.map(ep =>
        `[${ep.timestamp}] ${ep.summary}: ${ep.content.slice(0, 250)}...`
      ),
    );
  }

  // Known facts
  if (ctx.knownFacts.length > 0) {
    sections.push(
      '',
      `=== Known Facts ===`,
      ...ctx.knownFacts.map(f => `• [${f.factType}] ${f.content}`),
    );
  }

  if (sections.length === 0) {
    return ''; // No context available yet — first analysis run
  }

  return '\n\n' + sections.join('\n');
}

/**
 * Get a summary of the current knowledge state for a symbol.
 * Useful for the UI to show how much context has been accumulated.
 */
export async function getKnowledgeStatus(symbol: string): Promise<{
  conceptsKnown: number;
  pastDecisions: number;
  episodesStored: number;
  lastAnalysis?: string;
}> {
  try {
    const cogOS = getCognitionOS();
    const memVault = getMemoryVault();

    const [concepts, episodes] = await Promise.allSettled([
      cogOS.vectorSearch(symbol, 20, 0.1),
      memVault.search({ query: symbol, limit: 1 }),
    ]);

    return {
      conceptsKnown: concepts.status === 'fulfilled' ? concepts.value.length : 0,
      pastDecisions: 0, // Would need a filtered search
      episodesStored: episodes.status === 'fulfilled' ? (episodes.value.episodes || []).length : 0,
      lastAnalysis: episodes.status === 'fulfilled' && episodes.value.episodes?.length > 0
        ? episodes.value.episodes[0].timestamp
        : undefined,
    };
  } catch {
    return { conceptsKnown: 0, pastDecisions: 0, episodesStored: 0 };
  }
}
