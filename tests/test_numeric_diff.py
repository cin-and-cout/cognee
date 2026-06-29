import pytest

from app.schemas import Claim, Politician, Topic
from app.services.comparison.numeric_diff import calculate_numeric_diff


def test_numeric_diff_consistent():
    politician = Politician(name="Test Politician")
    topic = Topic(name="Economy")

    c1 = Claim(
        statement="Unemployment is 4.0%",
        politician=politician,
        topic=topic,
        claim_date="2024-01-01",
        is_numeric=True,
        metric="unemployment rate",
        value=4.0,
        unit="%",
    )
    c2 = Claim(
        statement="Unemployment is at 4.0%",
        politician=politician,
        topic=topic,
        claim_date="2024-02-01",
        is_numeric=True,
        metric="unemployment rate",
        value=4.0,
        unit="%",
    )

    c1.politician = politician
    c1.topic = topic
    c2.politician = politician
    c2.topic = topic

    result = calculate_numeric_diff(c1, c2)
    assert result["is_consistent"] is True
    assert result["absolute_drift"] == 0.0
    assert result["percentage_variance"] == 0.0
    assert "consistent" in result["verdict"]


def test_numeric_diff_inconsistent():
    politician = Politician(name="Test Politician")
    topic = Topic(name="Economy")

    c1 = Claim(
        statement="Unemployment is 4.2%",
        politician=politician,
        topic=topic,
        claim_date="2024-01-01",
        is_numeric=True,
        metric="unemployment rate",
        value=4.2,
        unit="%",
    )
    c2 = Claim(
        statement="Unemployment is 3.8%",
        politician=politician,
        topic=topic,
        claim_date="2024-02-01",
        is_numeric=True,
        metric="unemployment rate",
        value=3.8,
        unit="%",
    )

    c1.politician = politician
    c1.topic = topic
    c2.politician = politician
    c2.topic = topic

    result = calculate_numeric_diff(c1, c2)
    assert result["is_consistent"] is False
    # 4.2 - 3.8 = 0.4
    assert abs(result["absolute_drift"] - 0.4) < 1e-9
    # (0.4 / 4.2) * 100 = 9.5238
    assert abs(result["percentage_variance"] - 9.5238) < 1e-3
    assert "differs from earlier figure" in result["verdict"]


def test_numeric_diff_zero_division():
    politician = Politician(name="Test Politician")
    topic = Topic(name="Deficit")

    c1 = Claim(
        statement="Deficit growth is 0%",
        politician=politician,
        topic=topic,
        claim_date="2024-01-01",
        is_numeric=True,
        metric="deficit growth",
        value=0.0,
        unit="%",
    )
    c2 = Claim(
        statement="Deficit growth is 5%",
        politician=politician,
        topic=topic,
        claim_date="2024-02-01",
        is_numeric=True,
        metric="deficit growth",
        value=5.0,
        unit="%",
    )

    c1.politician = politician
    c1.topic = topic
    c2.politician = politician
    c2.topic = topic

    result = calculate_numeric_diff(c1, c2)
    assert result["is_consistent"] is False
    assert result["absolute_drift"] == 5.0
    assert result["percentage_variance"] == float("inf")


def test_numeric_diff_invalid_claims():
    politician = Politician(name="Test Politician")
    topic = Topic(name="Economy")

    c_non_numeric = Claim(
        statement="Economy is doing great.",
        politician=politician,
        topic=topic,
        claim_date="2024-01-01",
        is_numeric=False,
    )
    c_numeric_no_val = Claim(
        statement="Inflation is up",
        politician=politician,
        topic=topic,
        claim_date="2024-01-01",
        is_numeric=True,
        value=None,
    )

    c_non_numeric.politician = politician
    c_non_numeric.topic = topic
    c_numeric_no_val.politician = politician
    c_numeric_no_val.topic = topic

    with pytest.raises(ValueError, match="must be numeric"):
        calculate_numeric_diff(c_non_numeric, c_numeric_no_val)

    with pytest.raises(ValueError, match="must have numeric values populated"):
        calculate_numeric_diff(c_numeric_no_val, c_numeric_no_val)
