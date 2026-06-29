from typing import Any, Dict

from app.schemas import Claim


def calculate_numeric_diff(old_claim: Claim, new_claim: Claim) -> Dict[str, Any]:
    """
    Calculates the mathematical difference between two numeric claims.
    Raises ValueError if either claim is not numeric or lacks a value.

    Returns a dictionary containing:
        - is_consistent (bool): True if values are equal (within 1e-9 tolerance)
        - absolute_drift (float): Absolute difference between the values
        - percentage_variance (float): Relative percentage change from the old value
        - verdict (str): Human-readable comparison summary
    """
    if not old_claim.is_numeric or not new_claim.is_numeric:
        raise ValueError("Both claims must be numeric to compute a numeric diff.")

    if old_claim.value is None or new_claim.value is None:
        raise ValueError("Both claims must have numeric values populated.")

    old_val = float(old_claim.value)
    new_val = float(new_claim.value)

    absolute_drift = abs(new_val - old_val)

    if old_val == 0.0:
        percentage_variance = 0.0 if new_val == 0.0 else float("inf")
    else:
        percentage_variance = (absolute_drift / abs(old_val)) * 100.0

    is_consistent = absolute_drift < 1e-9

    unit_str = f" {old_claim.unit}" if old_claim.unit else ""
    metric_str = f" for '{old_claim.metric}'" if old_claim.metric else ""

    if is_consistent:
        verdict = (
            f"Stated figure of {new_val}{unit_str}{metric_str} is consistent "
            f"with the earlier figure of {old_val}{unit_str}."
        )
    else:
        verdict = (
            f"Stated figure of {new_val}{unit_str}{metric_str} (on {new_claim.claim_date}) "
            f"differs from earlier figure of {old_val}{unit_str} (on {old_claim.claim_date}) "
            f"by an absolute drift of {absolute_drift:.2f}{unit_str} "
            f"(relative change of {percentage_variance:.2f}%)."
        )

    return {
        "is_consistent": is_consistent,
        "absolute_drift": round(absolute_drift, 9),
        "percentage_variance": (
            round(percentage_variance, 4)
            if percentage_variance != float("inf")
            else percentage_variance
        ),
        "verdict": verdict,
    }
