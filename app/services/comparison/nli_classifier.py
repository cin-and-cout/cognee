from typing import Any, Dict, Optional

from cognee.infrastructure.llm.LLMGateway import LLMGateway
from pydantic import BaseModel, Field

from app.schemas import Claim


class NLIVerdictModel(BaseModel):
    """
    Pydantic model representing structured output from the LLM for NLI comparison.
    """

    label: str = Field(
        ...,
        description=(
            "Strict NLI classification label. Must be exactly one of: "
            "'Consistent with prior statements', 'Contradicts statement from [date]', "
            "or 'No prior record'."
        ),
    )
    explanation: str = Field(
        ...,
        description="A concise explanation justifying the NLI classification choice.",
    )


SYSTEM_PROMPT = """
You are an expert Natural Language Inference (NLI) agent specializing in
fact-checking and public statement consistency tracking.
Your task is to compare a new claim made by a politician with a
historical claim they made in the past.

Historical Claim:
Date: {historical_date}
Statement: {historical_statement}

New Claim:
Date: {new_date}
Statement: {new_statement}

Analyze if the new claim is:
1. "Consistent with prior statements" - The new claim supports, agrees
   with, or logically extends the historical claim.
2. "Contradicts statement from {historical_date}" - The new claim
   directly contradicts, denies, or is logically inconsistent with the
   historical claim.
3. "No prior record" - The two claims are completely unrelated and
   cannot be compared.

Output requirements:
- label: Must be exactly one of: "Consistent with prior statements",
  "Contradicts statement from {historical_date}", or "No prior record".
- explanation: A concise explanation of your reasoning.
"""


async def classify_nli_contradiction(
    new_claim: Claim,
    historical_claim: Optional[Claim] = None,
) -> Dict[str, Any]:
    """
    Classifies the qualitative consistency between a new claim and an optional
    historical claim.
    If no historical claim is provided, immediately returns a "No prior record" label.
    """
    if not historical_claim:
        return {
            "label": "No prior record",
            "explanation": (
                "No prior historical claims were found matching this topic for the politician."
            ),
        }

    formatted_prompt = SYSTEM_PROMPT.format(
        historical_date=historical_claim.claim_date,
        historical_statement=historical_claim.statement,
        new_date=new_claim.claim_date,
        new_statement=new_claim.statement,
    )

    try:
        verdict: NLIVerdictModel = await LLMGateway.acreate_structured_output(
            text_input=(f"New: {new_claim.statement}\nHistorical: {historical_claim.statement}"),
            system_prompt=formatted_prompt.strip(),
            response_model=NLIVerdictModel,
        )

        # Enforce that the label matches target expectation
        label = verdict.label.strip()
        expected_contradict = f"Contradicts statement from {historical_claim.claim_date}"

        # Clean/normalize labels if the LLM output deviates slightly in wording
        if label != "Consistent with prior statements" and label != "No prior record":
            if "contradict" in label.lower():
                label = expected_contradict
            else:
                label = "No prior record"

        return {
            "label": label,
            "explanation": verdict.explanation,
        }

    except Exception as e:
        return {
            "label": "No prior record",
            "explanation": f"Failed to perform qualitative NLI classification due to error: {e}",
        }
