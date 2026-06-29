from typing import Optional

from cognee.infrastructure.llm.LLMGateway import LLMGateway
from pydantic import BaseModel, Field

from app.schemas import Claim, Politician, Topic


class ExtractedClaimModel(BaseModel):
    """
    Pydantic model representing structured output from the LLM for claim extraction.
    """
    has_claim: bool = Field(
        ...,
        description=(
            "True if the sentence contains a checkable, factual statement or specific policy "
            "commitment that can be verified against historical records. "
            "False if it is a general, introductory, or non-factual statement."
        ),
    )
    topic: Optional[str] = Field(
        None,
        description=(
            "The category/topic of the claim (e.g., Inflation, Unemployment, Affordable Housing, "
            "Public Transit, Taxes) if has_claim is True."
        ),
    )
    statement: Optional[str] = Field(
        None,
        description="The checkable statement or commitment made in the text if has_claim is True.",
    )
    is_numeric: Optional[bool] = Field(
        None,
        description=(
            "True if the claim asserts a specific numerical metric value (e.g., percentage, "
            "count, amount of money) if has_claim is True."
        ),
    )
    metric: Optional[str] = Field(
        None,
        description=(
            "The name of the metric (e.g., Inflation Rate, Unemployment Rate, Affordable Housing "
            "Units Built, Income Tax Surcharge) if is_numeric is True."
        ),
    )
    value: Optional[float] = Field(
        None,
        description="The numeric value mentioned in the statement if is_numeric is True.",
    )
    unit: Optional[str] = Field(
        None,
        description="The unit of measurement (e.g., %, units, $) if is_numeric is True.",
    )

SYSTEM_PROMPT = """
You are an expert fact-checking assistant. Your task is to analyze a single sentence
from a politician's speech and extract any checkable factual claims or specific policy commitments.

A checkable claim is a statement that can be validated against external statistics,
historical records, or previous public commitments (e.g., inflation rates, unemployment
numbers, housing figures, tax rate changes, or public transit fare freezing/adjustments).
General commentary, greetings, introductory remarks, vague slogans (e.g., "our job market
is stronger than ever" without numbers/policies), or transition sentences do NOT
count as checkable claims.

Identify if the sentence contains a checkable claim. If it does:
1. Identify the topic (must be one of: Inflation, Unemployment,
   Affordable Housing, Public Transit, Taxes).
2. Extract the exact statement.
3. Determine if it is a numeric claim (contains a specific stat, count, rate, or dollar amount).
4. If it is numeric, extract the metric, the float value, and the unit.
"""

async def extract_claim_from_text(
    text: str,
    politician_name: str,
    claim_date: str,
    politician_party: Optional[str] = None,
) -> Optional[Claim]:
    """
    Extracts a structured Claim object from a given raw text sentence if a
    checkable claim is present. Returns None if no checkable claim is found.
    """
    try:
        extracted: ExtractedClaimModel = await LLMGateway.acreate_structured_output(
            text_input=text,
            system_prompt=SYSTEM_PROMPT.strip(),
            response_model=ExtractedClaimModel,
        )

        if not extracted.has_claim or not extracted.topic or not extracted.statement:
            return None

        # Instantiate the custom Datapoint models
        politician_node = Politician(
            name=politician_name,
            party=politician_party,
        )

        topic_node = Topic(
            name=extracted.topic,
        )

        claim_node = Claim(
            statement=extracted.statement,
            politician=politician_node,
            topic=topic_node,
            claim_date=claim_date,
            is_numeric=extracted.is_numeric or False,
            metric=extracted.metric,
            value=extracted.value,
            unit=extracted.unit,
        )

        # Explicitly link relations for Cognee representation
        claim_node.politician = politician_node
        claim_node.topic = topic_node

        return claim_node

    except Exception as e:
        print(f"Error extracting claim from text: {e}")
        return None
