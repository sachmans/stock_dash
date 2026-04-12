/**
 * CognitionOS HTTP Client
 * 
 * Production-grade client for the CognitionOS knowledge graph service.
 * Built from the actual API_CONTRACT.md in the cognition_os repo.
 * 
 * Base URL: https://cognition.s9n.dxb-gw.basanti.ai
 * Auth: X-Org-Id header (required), Authorization: Bearer <token> (for reasoning/documents)
 */

/* ─── Types ─── */

export type NodeType =
  | 'SuperRoot' | 'Concept' | 'Application' | 'Journey' | 'Feature'
  | 'Requirement' | 'Task' | 'Persona' | 'PainPoint' | 'Goal'
  | 'Metric' | 'Constraint' | 'JourneyStep' | 'Skill' | 'Episode'
  | 'Fact' | 'Story' | 'Person' | 'Organisation' | 'Solution'
  | 'Document' | 'Email' | 'AgentLog' | 'ReasoningNode' | 'DesignDecision';

export type RelationshipType =
  | 'CONTAINS' | 'PARENT_OF' | 'RELATED_TO' | 'SIMILAR_TO'
  | 'DERIVED_FROM' | 'ALIGNS_WITH' | 'SUBCONCEPT_OF' | 'GENERALISES'
  | 'REQUIRES' | 'EXTENDS' | 'DEPENDS_ON' | 'EXTRACTED_FROM'
  | 'AUTHORED_BY' | 'PRECEDES' | 'CO_OCCURS_WITH' | 'SUPPORTS'
  | 'CONTRADICTS' | 'REASONS_ABOUT' | 'OWNS' | 'HAS_FEATURE'
  | 'HAS_REQUIREMENT' | 'HAS_TASK' | 'HAS_SOLUTION';

export type GraphType = 'product' | 'people' | 'concept' | 'code' | 'kit' | 'custom';

export type ReasoningType = 'observation' | 'inference' | 'decision' | 'question' | 'answer';

export interface CogOSConfig {
  baseUrl: string;
  orgId: string;
  graphName: string;
  authToken?: string;  // Required for reasoning/documents endpoints
}

export interface NodeResponse {
  id: string;
  message: string;
}

export interface ConceptResponse {
  id: string;
  message: string;
}

export interface VectorSearchResult {
  concept_id: string;
  name: string;
  description: string;
  node_type: string;
  score: number;
}

/* ─── Client ─── */

export class CognitionOSClient {
  private config: CogOSConfig;
  private timeout = 15_000;

  constructor(config: CogOSConfig) {
    this.config = config;
  }

  private headers(requireAuth = false): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Org-Id': this.config.orgId,
    };
    if (requireAuth && this.config.authToken) {
      h['Authorization'] = `Bearer ${this.config.authToken}`;
    }
    return h;
  }

  private async post<T = any>(path: string, body: Record<string, any>, requireAuth = false): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(requireAuth),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`CognitionOS ${path} returned ${res.status}: ${text}`);
      }

      return await res.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async get<T = any>(path: string, requireAuth = false): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.headers(requireAuth),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`CognitionOS GET ${path} returned ${res.status}: ${text}`);
      }

      return await res.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ─── Health ─── */

  async health(): Promise<{ status: string; service: string; version: string }> {
    return this.get('/health');
  }

  async healthReady(): Promise<{
    status: string;
    checks: Array<{ service: string; status: string; latency_ms: number; message: string }>;
  }> {
    return this.get('/health/ready');
  }

  /* ─── Graph: SuperRoot ─── */

  async createSuperRoot(tenantId: string, graphType: GraphType = 'concept'): Promise<NodeResponse> {
    return this.post('/v1/graphs/super-root', {
      tenant_id: tenantId,
      graph_type: graphType,
      graph_name: this.config.graphName,
    });
  }

  /* ─── Graph: Nodes ─── */

  async createNode(params: {
    name: string;
    nodeType: NodeType;
    description?: string;
    graphType?: GraphType;
    metadata?: Record<string, any>;
  }): Promise<NodeResponse> {
    return this.post('/v1/graphs/nodes', {
      name: params.name,
      node_type: params.nodeType,
      description: params.description || '',
      graph_type: params.graphType || 'concept',
      graph_name: this.config.graphName,
      metadata: params.metadata || {},
    });
  }

  /* ─── Graph: Relationships ─── */

  async createRelationship(params: {
    sourceId: string;
    targetId: string;
    relType: RelationshipType;
  }): Promise<NodeResponse> {
    return this.post('/v1/graphs/relationships', {
      source_id: params.sourceId,
      target_id: params.targetId,
      rel_type: params.relType,
      graph_name: this.config.graphName,
    });
  }

  /* ─── Concepts ─── */

  async addConcept(params: {
    name: string;
    description?: string;
    parentId?: string;
    knowledgeDomain?: string;
    confidence?: number;
  }): Promise<ConceptResponse> {
    return this.post('/v1/concepts', {
      name: params.name,
      description: params.description || '',
      parent_id: params.parentId || null,
      knowledge_domain: params.knowledgeDomain || '',
      confidence: params.confidence ?? 1.0,
      graph_name: this.config.graphName,
    });
  }

  /* ─── Vector Search ─── */

  async vectorSearch(query: string, topK = 10, minScore = 0.0): Promise<VectorSearchResult[]> {
    return this.post('/v1/concepts/vectors/search', {
      query,
      top_k: topK,
      min_score: minScore,
    });
  }

  /* ─── Vector Batch Index ─── */

  async vectorBatchIndex(entities: Array<{
    entityId: string;
    name: string;
    description: string;
    nodeType?: NodeType;
    contentType?: string;
    metadata?: Record<string, any>;
  }>, collection?: string): Promise<{ indexed: number }> {
    return this.post('/v1/concepts/vectors/batch', {
      entities: entities.map(e => ({
        entity_id: e.entityId,
        name: e.name,
        description: e.description,
        node_type: e.nodeType || 'Concept',
        content_type: e.contentType || 'concept',
        graph_name: this.config.graphName,
        metadata: e.metadata || {},
      })),
      collection: collection || null,
    });
  }

  /* ─── Documents (async ingestion) ─── */

  async ingestDocument(params: {
    content: string;
    contentType?: string;
    metadata?: Record<string, any>;
  }): Promise<{ task_id: string; status: string }> {
    return this.post('/v1/documents', {
      content: params.content,
      content_type: params.contentType || 'text',
      graph_name: this.config.graphName,
      metadata: params.metadata || {},
    }, true);  // Requires auth
  }

  /* ─── Reasoning Nodes (Graph of Thought) ─── */

  async createReasoningNode(params: {
    reasoningType?: ReasoningType;
    content: string;
    confidence?: number;
    parentIds?: string[];
    producedEntityIds?: string[];
    metadata?: Record<string, any>;
  }): Promise<NodeResponse> {
    return this.post('/v1/reasoning/nodes', {
      reasoning_type: params.reasoningType || 'observation',
      content: params.content,
      confidence: params.confidence ?? 1.0,
      parent_ids: params.parentIds || [],
      produced_entity_ids: params.producedEntityIds || [],
      graph_name: this.config.graphName,
      metadata: params.metadata || {},
    }, true);  // Requires auth
  }

  /* ─── Unified Search ─── */

  async search(query: string, topK = 10): Promise<any> {
    return this.post('/v1/search', { query, top_k: topK });
  }
}

/* ─── Singleton Factory ─── */

let _instance: CognitionOSClient | null = null;

export function getCognitionOS(): CognitionOSClient {
  if (!_instance) {
    const baseUrl = process.env.COGNITION_OS_URL || 'https://cognition.s9n.dxb-gw.basanti.ai';
    const orgId = process.env.COGNITION_OS_TENANT_ID || 'stock_dash';
    const graphName = process.env.COGNITION_OS_GRAPH_NAME || 'stock_trading';
    const authToken = process.env.COGNITION_OS_AUTH_TOKEN || '';

    _instance = new CognitionOSClient({ baseUrl, orgId, graphName, authToken });
  }
  return _instance;
}

/** Reset singleton (for testing) */
export function resetCognitionOS(): void {
  _instance = null;
}
