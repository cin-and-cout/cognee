from datetime import datetime
import time
import logging
from typing import List, Optional, Tuple
from uuid import UUID

from cognee.infrastructure.databases.graph import get_graph_engine

from app.schemas import Claim, Politician, Topic

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level TTL cache for the full graph dump.
# Fetching all nodes+edges is O(n) and blocks the event loop; caching for
# a short window eliminates redundant dumps during rapid speech bursts while
# still reflecting newly-ingested claims within a few seconds.
# ---------------------------------------------------------------------------
_graph_cache: Optional[Tuple] = None  # (nodes, edges)
_graph_cache_ts: float = 0.0
_GRAPH_CACHE_TTL: float = 3.0  # seconds


async def get_historical_claims(
    topic_name: str,
    politician_name: Optional[str] = None,
) -> List[Claim]:
    """
    Queries the Cognee graph database directly to retrieve historical Claims
    matching the given topic and optional politician name.

    Returns the list of Claims sorted by claim_date descending (newest first).
    """
    logger.info("get_historical_claims called", extra={"topic_name": topic_name, "politician_name": politician_name})
    
    import os
    cognee_api_key = os.getenv("COGNEE_API_KEY")
    if cognee_api_key:
        import cognee
        from cognee import SearchType
        
        logger.info("Cognee Cloud: Querying historical claims remotely...")
        query = f"Claims related to topic {topic_name}"
        if politician_name:
            query += f" by {politician_name}"
            
        try:
            results = await cognee.search(
                query_text=query,
                query_type=SearchType.TRIPLET_COMPLETION,
                verbose=True
            )
            
            matching_claims = []
            for result in results:
                data = None
                if hasattr(result, "search_result"):
                    data = result.search_result
                elif isinstance(result, dict):
                    data = result.get("search_result")
                
                if not data:
                    continue
                
                statement = data.get("statement") or data.get("text")
                if not statement:
                    continue
                
                c_id = data.get("id")
                c_uuid = UUID(c_id) if c_id else UUID(int=0)
                
                p_data = data.get("politician") or {}
                p_name = p_data.get("name") or politician_name or "Unknown Politician"
                politician_obj = Politician(
                    id=UUID(p_data.get("id")) if p_data.get("id") else UUID(int=0),
                    name=p_name,
                    party=p_data.get("party") or None
                )
                
                topic_obj = Topic(
                    id=UUID(data.get("topic", {}).get("id")) if data.get("topic", {}).get("id") else UUID(int=0),
                    name=data.get("topic", {}).get("name") or topic_name
                )
                
                claim_obj = Claim(
                    id=c_uuid,
                    statement=statement,
                    claim_date=data.get("claim_date") or "2026-07-06",
                    source_link=data.get("source_link") or None,
                    is_numeric=data.get("is_numeric", False),
                    metric=data.get("metric") or None,
                    value=data.get("value") or None,
                    unit=data.get("unit") or None,
                    politician=politician_obj,
                    topic=topic_obj
                )
                claim_obj.politician = politician_obj
                claim_obj.topic = topic_obj
                
                matching_claims.append(claim_obj)
            
            # Sort claims by date descending
            def get_date(c: Claim) -> datetime:
                try:
                    return datetime.strptime(c.claim_date, "%Y-%m-%d")
                except Exception:
                    return datetime.min

            matching_claims.sort(key=get_date, reverse=True)
            logger.info("Cognee Cloud: returned matching claims", extra={"returned_count": len(matching_claims)})
            return matching_claims
            
        except Exception as e:
            logger.exception("Error querying Cognee Cloud for historical claims", exc_info=e)
            return []

    global _graph_cache, _graph_cache_ts
    start_time = time.time()
    now = start_time

    if _graph_cache is not None and (now - _graph_cache_ts) < _GRAPH_CACHE_TTL:
        nodes, edges = _graph_cache
        logger.debug(
            "Graph cache HIT (%.2fs old, TTL %.1fs)",
            now - _graph_cache_ts,
            _GRAPH_CACHE_TTL,
        )
    else:
        graph_engine = await get_graph_engine()
        logger.debug("Graph engine acquired", extra={"engine_type": type(graph_engine).__name__})
        nodes, edges = await graph_engine.get_graph_data()
        _graph_cache = (nodes, edges)
        _graph_cache_ts = time.time()
        latency_ms = int((time.time() - start_time) * 1000)
        logger.debug(
            "Graph cache MISS — fetched and cached  (%dms)",
            latency_ms,
            extra={"node_count": len(nodes), "edge_count": len(edges)},
        )

    # Create a mapping of string IDs to node properties for fast lookup
    node_map = {str(node_id): props for node_id, props in nodes}

    # Find the target Topic node ID(s)
    target_topic_ids = set()
    for node_id, props in nodes:
        if (
            props.get("type") == "Topic"
            and props.get("name", "").strip().lower() == topic_name.strip().lower()
        ):
            target_topic_ids.add(str(node_id))

    logger.debug("Topic nodes found", extra={"topic_count": len(target_topic_ids)})
    if not target_topic_ids:
        logger.info("No matching topic nodes found, returning early", extra={"topic_name": topic_name})
        return []

    # Find the target Politician node ID(s) if politician_name is provided
    target_politician_ids = set()
    if politician_name:
        for node_id, props in nodes:
            if (
                props.get("type") == "Politician"
                and props.get("name", "").strip().lower() == politician_name.strip().lower()
            ):
                target_politician_ids.add(str(node_id))
        logger.debug("Politician nodes found", extra={"politician_count": len(target_politician_ids)})
        if not target_politician_ids:
            logger.info("No matching politician nodes found, returning early", extra={"politician_name": politician_name})
            return []

    # Map claim_id to its connected topic and politician IDs
    claim_connections = {}
    for edge in edges:
        if len(edge) < 3:
            continue
        source_id = str(edge[0])
        target_id = str(edge[1])
        rel_type = edge[2]

        # Only care about edges originating from Claim nodes
        source_props = node_map.get(source_id)
        if not source_props or source_props.get("type") != "Claim":
            continue

        if source_id not in claim_connections:
            claim_connections[source_id] = {"topic_id": None, "politician_id": None}

        if rel_type == "topic":
            claim_connections[source_id]["topic_id"] = target_id
        elif rel_type == "politician":
            claim_connections[source_id]["politician_id"] = target_id

    # Filter claims based on connections and construct models
    matching_claims = []
    for claim_id, conns in claim_connections.items():
        # Check topic match
        if not conns["topic_id"] or conns["topic_id"] not in target_topic_ids:
            continue

        # Check politician match if filtered
        if politician_name and (
            not conns["politician_id"] or conns["politician_id"] not in target_politician_ids
        ):
            continue

        claim_props = node_map[claim_id]

        # Reconstruct Politician object
        politician_obj = None
        if conns["politician_id"]:
            p_props = node_map[conns["politician_id"]]
            politician_obj = Politician(
                id=UUID(conns["politician_id"]),
                name=p_props.get("name"),
                party=p_props.get("party"),
            )

        # Reconstruct Topic object
        topic_obj = None
        if conns["topic_id"]:
            t_props = node_map[conns["topic_id"]]
            topic_obj = Topic(
                id=UUID(conns["topic_id"]),
                name=t_props.get("name"),
            )

        claim_obj = Claim(
            id=UUID(claim_id),
            statement=claim_props.get("statement"),
            claim_date=claim_props.get("claim_date"),
            source_link=claim_props.get("source_link"),
            is_numeric=claim_props.get("is_numeric", False),
            metric=claim_props.get("metric"),
            value=claim_props.get("value"),
            unit=claim_props.get("unit"),
            politician=politician_obj,
            topic=topic_obj,
        )
        claim_obj.politician = politician_obj
        claim_obj.topic = topic_obj

        matching_claims.append(claim_obj)

    logger.info("Claims filtered and matched", extra={"total_claims_in_db": len(claim_connections), "matched_claims": len(matching_claims)})

    # Sort matching claims by claim_date descending
    def get_date(c: Claim) -> datetime:
        try:
            return datetime.strptime(c.claim_date, "%Y-%m-%d")
        except Exception as e:
            logger.warning("Exception during date reconstruction", extra={"claim_id": str(c.id), "error": str(e)})
            return datetime.min

    matching_claims.sort(key=get_date, reverse=True)
    logger.info("Returning historical claims", extra={"returned_count": len(matching_claims)})
    return matching_claims


async def get_most_recent_claim(
    topic_name: str,
    politician_name: Optional[str] = None,
) -> Optional[Claim]:
    """
    Retrieves the single most recent historical Claim for a given topic
    and optional politician.
    """
    claims = await get_historical_claims(topic_name, politician_name)
    return claims[0] if claims else None
