from typing import Any, Optional

from cognee.infrastructure.engine import DataPoint
from pydantic import SkipValidation


class Politician(DataPoint):
    """
    Represents a politician node in the knowledge graph.
    """

    name: str
    party: Optional[str] = None

    metadata: dict = {
        "index_fields": ["name"],
    }


class Topic(DataPoint):
    """
    Represents a policy area or thematic topic (e.g., Inflation, Unemployment).
    Can reference parent topics to build a taxonomy tree.
    """

    name: str
    parent_topic: SkipValidation[Optional[Any]] = None

    metadata: dict = {
        "index_fields": ["name"],
    }


class Claim(DataPoint):
    """
    Represents a specific claim made by a politician.
    Links to the politician, the topic/subtopic category, and contains
    metadata regarding date, source, and numeric metrics (if applicable).
    """

    statement: str
    politician: SkipValidation[Any]
    topic: SkipValidation[Any]
    claim_date: str  # Format: YYYY-MM-DD
    source_link: Optional[str] = None

    # Quantitative fields for numeric drift comparison
    is_numeric: bool = False
    metric: Optional[str] = None  # e.g., "inflation rate"
    value: Optional[float] = None
    unit: Optional[str] = None  # e.g., "%", "billion dollars"

    metadata: dict = {
        "index_fields": ["statement", "metric"],
    }
