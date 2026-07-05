from datetime import date
from typing import Any, Literal, Optional

from cognee.infrastructure.engine import DataPoint
from pydantic import SkipValidation, field_validator


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
    claim_date: str  # Format: YYYY-MM-DD (validated on input)
    source_link: Optional[str] = None
    speaker_confidence: str = "low"
    source_type: Literal["historical", "live"] = "historical"

    # Quantitative fields for numeric drift comparison
    is_numeric: bool = False
    metric: Optional[str] = None  # e.g., "inflation rate"
    value: Optional[float] = None
    unit: Optional[str] = None  # e.g., "%", "billion dollars"

    metadata: dict = {
        "index_fields": ["statement", "metric", "source_type"],
    }

    @field_validator("claim_date", mode="before")
    @classmethod
    def validate_claim_date(cls, v: Any) -> str:
        """
        Accepts a datetime.date object or an ISO-format string (YYYY-MM-DD).
        Normalises to a zero-padded YYYY-MM-DD string so comparisons are safe
        and the value remains JSON-serialisable for Cognee's graph layer.
        """
        if isinstance(v, date):
            return v.isoformat()
        try:
            return date.fromisoformat(str(v)).isoformat()
        except ValueError as exc:
            raise ValueError(
                f"claim_date must be a valid YYYY-MM-DD date string, got: {v!r}"
            ) from exc
