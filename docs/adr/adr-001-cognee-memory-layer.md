# ADR 001: Selection of Cognee as the Memory and Knowledge Graph Layer

## Status
Proposed

## Context
The Claim Consistency Tracker requires a robust memory substrate to ingest, structure, and query a politician's historical statements over time. We need to represent:
1.  Entities (Politicians, Topics, Claims, Dates, Sources).
2.  Relationships (e.g., `Politician` -> `stated` -> `Claim`).
3.  Temporal progression (e.g., when a claim was made relative to another).

A standard vector database stores unstructured text embeddings but struggles with complex relational traversals (such as grouping all claims by a specific politician under a specific sub-topic hierarchy like *Economy -> Inflation*) and temporal queries (identifying what was claimed *before* a specific date).

## Decision
We will use **Cognee** (Python library) as the core memory and knowledge graph layer. 

Cognee provides:
*   **Structured Fact Extraction:** Translating raw text into subject-relation-object triplets.
*   **Temporal Cognify:** Out-of-the-box pipeline support (`temporal_cognify=True`) to automatically organize ingested nodes on a timeline based on dates mentioned in the text or ingestion metadata.
*   **Temporal Queries:** Native `SearchType.TEMPORAL` queries to search the graph with before/after constraints.
*   **Ontologies:** Custom Pydantic-based `DataPoint` definitions to define the domain schema (Politician, Topic, Claim).

## Consequences
*   **Pros:**
    *   Avoids custom graphing code or raw Neo4j schema writing.
    *   Saves development time on temporal indexing.
    *   Maintains a clear relational hierarchy of topics and claims.
*   **Cons:**
    *   Python-only API, locking the backend tech stack to Python (e.g., FastAPI).
    *   Slight learning curve for configuring local graph store vs. vector backends (e.g., Qdrant/Weaviate and NetworkX/Neo4j).

## Confidence Score: 5 / 5
This choice aligns directly with the tool's core strength (temporal, structured knowledge graphs) and solves the main relational requirement of tracking statement histories.
