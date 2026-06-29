from datetime import datetime
from typing import List, Optional
from uuid import UUID

from cognee.infrastructure.databases.graph import get_graph_engine

from app.schemas import Claim, Politician, Topic


async def get_historical_claims(
    topic_name: str,
    politician_name: Optional[str] = None,
) -> List[Claim]:
    """
    Queries the Cognee graph database directly to retrieve historical Claims
    matching the given topic and optional politician name.

    Returns the list of Claims sorted by claim_date descending (newest first).
    """
    graph_engine = await get_graph_engine()
    nodes, edges = await graph_engine.get_graph_data()

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

    if not target_topic_ids:
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
        if not target_politician_ids:
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

    # Sort matching claims by claim_date descending
    def get_date(c: Claim) -> datetime:
        try:
            return datetime.strptime(c.claim_date, "%Y-%m-%d")
        except Exception:
            return datetime.min

    matching_claims.sort(key=get_date, reverse=True)
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
