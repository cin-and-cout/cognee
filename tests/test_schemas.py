import pytest
from pydantic import ValidationError

from app.schemas import Claim, Politician, Topic


def test_politician_schema():
    politician = Politician(name="Senator Jane Doe", party="Independent")
    assert politician.name == "Senator Jane Doe"
    assert politician.party == "Independent"


def test_topic_schema():
    parent = Topic(name="Economy")
    child = Topic(name="Inflation", parent_topic=parent)
    assert child.name == "Inflation"
    assert child.parent_topic == parent


def test_claim_schema():
    politician = Politician(name="Senator Jane Doe", party="Independent")
    topic = Topic(name="Inflation")

    # Qualitative Claim
    claim = Claim(
        statement="We have kept inflation stable for three consecutive quarters.",
        politician=politician,
        topic=topic,
        claim_date="2026-06-01",
        source_link="https://example.com/speeches/jane-doe-jun-2026",
    )

    assert claim.statement == "We have kept inflation stable for three consecutive quarters."
    assert claim.politician == politician
    assert claim.topic == topic
    assert claim.claim_date == "2026-06-01"
    assert not claim.is_numeric

    # Numeric Claim
    numeric_claim = Claim(
        statement="Inflation dropped to 3.2% in June.",
        politician=politician,
        topic=topic,
        claim_date="2026-06-15",
        source_link="https://example.com/press/jane-doe-jun-15",
        is_numeric=True,
        metric="inflation rate",
        value=3.2,
        unit="%",
    )

    assert numeric_claim.is_numeric
    assert numeric_claim.metric == "inflation rate"
    assert numeric_claim.value == 3.2
    assert numeric_claim.unit == "%"


def test_missing_required_fields():
    # Attempting to create a claim without required politician/topic fields
    with pytest.raises(ValidationError):
        # Missing politician and topic
        Claim(
            statement="Invalid claim",
            claim_date="2026-06-01",
        )
