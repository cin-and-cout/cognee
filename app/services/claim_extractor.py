from collections import deque
from typing import Optional

from app.services.coreference import SpeechContext, has_references

from app.services.llm_caller import acreate_structured_output_with_rotation
from pydantic import BaseModel, Field

from app.schemas import Claim, Politician, Topic

import logging
logger = logging.getLogger(__name__)


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

If the sentence contains unresolved pronouns or indirect references
(e.g., "he", "she", "this plan", "that figure"), use the [Context] block
above to substitute the concrete referent before extracting the statement.
The extracted `statement` field MUST be fully self-contained — it must be
understandable without any prior context or the [Context] block.
"""


async def extract_claim_from_text(
    text: str,
    politician_name: str,
    claim_date: str,
    politician_party: Optional[str] = None,
    sentence_history: Optional[deque] = None,
    speech_context: Optional[SpeechContext] = None,
) -> Optional[Claim]:
    """
    Extracts a structured Claim object from a given raw text sentence if a
    checkable claim is present. Returns None if no checkable claim is found.
    """
    logger.info(f"Extracting claim from text for politician: '{politician_name}'")
    logger.debug(f"Text snippet: {text[:100]}...")
    
    try:
        context_prefix = ""
        if has_references(text):
            if speech_context and not speech_context.is_empty():
                context_prefix = speech_context.to_context_string() + "\n"
            elif sentence_history:
                context_prefix = " ".join(list(sentence_history)[-2:]) + "\n"

        text_for_llm = context_prefix + text

        logger.info("Calling LLM Gateway for claim extraction...")
        logger.debug(f"System Prompt:\n{SYSTEM_PROMPT.strip()}\nText Input:\n{text_for_llm}")
        
        extracted: ExtractedClaimModel = await acreate_structured_output_with_rotation(
            text_input=text_for_llm,
            system_prompt=SYSTEM_PROMPT.strip(),
            response_model=ExtractedClaimModel,
        )

        logger.info(f"Received claim extraction output. Has claim: {extracted.has_claim}")
        logger.debug(f"Raw extracted claim data: {extracted.model_dump()}")

        if not extracted.has_claim or not extracted.topic or not extracted.statement:
            logger.info("No actionable claim found in the text.")
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
            raw_sentence=text if context_prefix else None,
        )

        # Explicitly link relations for Cognee representation
        claim_node.politician = politician_node
        claim_node.topic = topic_node

        return claim_node

    except Exception as e:
        logger.exception(f"Error extracting claim from text: {e}")
        return None
