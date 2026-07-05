import re
from dataclasses import dataclass
from typing import Literal, Optional

# Compiled regex for detecting references
# Use word boundaries (\b) and ignore case
REFERENCE_PATTERN = re.compile(
    r'\b(?:he|she|they|it|his|her|their|its|him|them|this|that|these|those|'
    r'that figure|the plan|the initiative|the policy|as mentioned|as i said|'
    r'the same|the former|the latter)\b',
    re.IGNORECASE
)

# Regex for extracting entities (heuristic-based)
PERSON_ORG_PATTERN = re.compile(r'\b([A-Z][a-z0-9]+(?: [A-Z][a-z0-9]+)*)\b')
METRIC_PATTERN = re.compile(r'\b(\d+\.?\d*\s*(?:%|billion|million|thousand|units|dollars?))(?:\b|\s|\.|,|$)', re.IGNORECASE)
POLICY_KEYWORDS = re.compile(r'\b(?:initiative|plan|policy|bill|act|program)\b', re.IGNORECASE)
ORG_SUFFIXES = re.compile(r'\b(?:Ltd|Corp|Inc|Party|Committee)\b', re.IGNORECASE)
TITLE_GENDER_MAP = {
    "Mr": "male",
    "Mr.": "male",
    "Mrs": "female",
    "Mrs.": "female",
    "Ms": "female",
    "Ms.": "female",
}

@dataclass
class Entity:
    name: str
    type: Literal["person", "policy", "metric", "organization"]
    gender: Optional[Literal["male", "female", "neutral"]] = None
    last_seen_idx: int = 0


def has_references(sentence: str) -> bool:
    """
    Returns True if the sentence contains pronouns, demonstratives, or anaphoric phrases.
    Runs purely locally using regex heuristics.
    """
    return bool(REFERENCE_PATTERN.search(sentence))


class SpeechContext:
    def __init__(self):
        self.entities: list[Entity] = []
        self.session_sentence_count: int = 0

    def is_empty(self) -> bool:
        return len(self.entities) == 0

    def _upsert_entity(self, new_entity: Entity):
        # Update existing by name (case-insensitive check), else append
        for i, ent in enumerate(self.entities):
            if ent.name.lower() == new_entity.name.lower():
                # Update last_seen_idx
                self.entities[i].last_seen_idx = new_entity.last_seen_idx
                # Update type/gender if new one is more specific
                if new_entity.gender:
                    self.entities[i].gender = new_entity.gender
                return
        
        # Append and enforce cap of 20
        self.entities.append(new_entity)
        if len(self.entities) > 20:
            # Evict the oldest (min last_seen_idx)
            oldest_idx = min(range(len(self.entities)), key=lambda idx: self.entities[idx].last_seen_idx)
            self.entities.pop(oldest_idx)

    def update(self, sentence: str, sentence_idx: int) -> None:
        """
        Updates the entity state heuristically based on the given sentence.
        Does NOT use an LLM.
        """
        self.session_sentence_count += 1
        
        # 1. Extract Metrics
        for match in METRIC_PATTERN.finditer(sentence):
            metric_str = match.group(1).strip()
            self._upsert_entity(Entity(name=metric_str, type="metric", last_seen_idx=sentence_idx))

        # 2. Extract Person/Organization/Policy from capitalized sequences
        for match in PERSON_ORG_PATTERN.finditer(sentence):
            ent_name = match.group(1).strip()
            if ent_name.lower() in {"i", "we", "the", "a", "an", "this", "that", "it", "he", "she", "they"}:
                continue
            
            ent_type = "person" # default
            gender = None

            if POLICY_KEYWORDS.search(ent_name) or (POLICY_KEYWORDS.search(sentence) and len(ent_name.split()) > 1):
                 if POLICY_KEYWORDS.search(ent_name):
                     ent_type = "policy"

            if ORG_SUFFIXES.search(ent_name):
                ent_type = "organization"

            # Check preceding word for titles to infer gender for persons
            start_pos = match.start()
            if start_pos > 0:
                prefix = sentence[:start_pos].strip().split()
                if prefix:
                    prev_word = prefix[-1]
                    if prev_word in TITLE_GENDER_MAP:
                        gender = TITLE_GENDER_MAP[prev_word]

            if start_pos == 0 and len(ent_name.split()) == 1 and not (gender or ent_type != "person"):
                continue

            self._upsert_entity(Entity(name=ent_name, type=ent_type, gender=gender, last_seen_idx=sentence_idx))

    def to_context_string(self) -> str:
        """
        Renders the entity list as a compact one-line string for LLM injection.
        """
        if not self.entities:
            return ""
        
        parts = []
        # Sort entities by last_seen_idx descending (most recent first)
        sorted_entities = sorted(self.entities, key=lambda e: e.last_seen_idx, reverse=True)
        
        for ent in sorted_entities:
            type_str = ent.type
            if ent.gender:
                type_str += f", {ent.gender}"
            parts.append(f"{ent.name} ({type_str})")
            
        return f"[Context: {', '.join(parts)}]"
