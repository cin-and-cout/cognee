from typing import Any, Dict, Optional
import logging
import time

from pydantic import BaseModel, Field
from app.services.llm_caller import acreate_structured_output_with_rotation

from app.schemas import Claim

logger = logging.getLogger(__name__)


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
    new_snippet = new_claim.statement[:80] + "..." if len(new_claim.statement) > 80 else new_claim.statement
    if not historical_claim:
        logger.info("No historical claim - early return", extra={"topic_name": new_claim.topic.name, "new_snippet": new_snippet})
        return {
            "label": "No prior record",
            "explanation": (
                "No prior historical claims were found matching this topic for the politician."
            ),
        }
        
    hist_snippet = historical_claim.statement[:80] + "..." if len(historical_claim.statement) > 80 else historical_claim.statement
    logger.info("classify_nli_contradiction called", extra={"new_date": new_claim.claim_date, "new_snippet": new_snippet, "historical_date": historical_claim.claim_date, "historical_snippet": hist_snippet})

    formatted_prompt = SYSTEM_PROMPT.format(
        historical_date=historical_claim.claim_date,
        historical_statement=historical_claim.statement,
        new_date=new_claim.claim_date,
        new_statement=new_claim.statement,
    )

    try:
        combined_text = f"New: {new_claim.statement}\nHistorical: {historical_claim.statement}"
        logger.info("LLM call dispatched for NLI", extra={"combined_text_chars": len(combined_text)})
        t_nli = time.perf_counter()
        verdict: NLIVerdictModel = await acreate_structured_output_with_rotation(
            text_input=combined_text,
            system_prompt=formatted_prompt.strip(),
            response_model=NLIVerdictModel,
        )
        nli_ms = int((time.perf_counter() - t_nli) * 1000)

        # Enforce that the label matches target expectation
        label = verdict.label.strip()
        expected_contradict = f"Contradicts statement from {historical_claim.claim_date}"

        logger.info(
            "LLM verdict received  (%dms)",
            nli_ms,
            extra={"raw_label": label, "explanation_snippet": verdict.explanation[:80] + "..." if len(verdict.explanation) > 80 else verdict.explanation},
        )

        # Clean/normalize labels if the LLM output deviates slightly in wording
        if label != "Consistent with prior statements" and label != "No prior record":
            if "contradict" in label.lower():
                logger.debug("Label normalization triggered", extra={"original_label": label, "normalized_label": expected_contradict})
                label = expected_contradict
            else:
                logger.debug("Label normalization triggered", extra={"original_label": label, "normalized_label": "No prior record"})
                label = "No prior record"

        return {
            "label": label,
            "explanation": verdict.explanation,
        }

    except Exception as e:
        logger.warning("Exception caught - fallback label", extra={"exception": e.__class__.__name__, "message": str(e)})
        return {
            "label": "No prior record",
            "explanation": f"Failed to perform qualitative NLI classification due to error: {e}",
        }
