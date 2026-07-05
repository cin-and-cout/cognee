import pytest
from app.services.coreference import has_references, SpeechContext

def test_has_references_pronouns():
    assert has_references("He said that.") is True
    assert has_references("She expects this to reduce costs.") is True
    assert has_references("They are working on it.") is True
    assert has_references("His plan is good.") is True
    assert has_references("Her idea was brilliant.") is True

def test_demonstratives_and_phrases():
    assert has_references("This will be great.") is True
    assert has_references("That figure is wrong.") is True
    assert has_references("The plan was announced.") is True
    assert has_references("As mentioned, we will proceed.") is True
    assert has_references("The former is better.") is True

def test_has_references_false_positives():
    assert has_references("Inflation was 3.2% last year.") is False
    assert has_references("Italy reduced its debt.") is True # 'its' is a pronoun
    assert has_references("Italy reduced national debt.") is False
    assert has_references("There are many options.") is False
    assert has_references("The heat is intense.") is False # "he" shouldn't match "heat"
    assert has_references("A hit song.") is False # "it" shouldn't match "hit"

def test_speech_context_metrics():
    ctx = SpeechContext()
    ctx.update("The inflation rate is 3.2%.", 1)
    assert len(ctx.entities) == 1
    assert ctx.entities[0].name == "3.2%"
    assert ctx.entities[0].type == "metric"
    assert ctx.entities[0].last_seen_idx == 1

def test_speech_context_person_and_policy():
    ctx = SpeechContext()
    ctx.update("Mr. John Doe announced the New Housing Initiative today.", 1)
    
    assert len(ctx.entities) == 2
    
    names = [e.name for e in ctx.entities]
    assert "John Doe" in names
    assert "New Housing Initiative" in names
    
    for e in ctx.entities:
        if e.name == "John Doe":
            assert e.type == "person"
            assert e.gender == "male"
        elif e.name == "New Housing Initiative":
            assert e.type == "policy"

def test_speech_context_eviction():
    ctx = SpeechContext()
    # Add 25 entities
    for i in range(25):
        ctx.update(f"I saw Person{i}.", i)
    
    # The limit is 20
    assert len(ctx.entities) == 20
    # Person0 to Person4 should be evicted
    names = [e.name for e in ctx.entities]
    assert "Person0" not in names
    assert "Person24" in names

def test_to_context_string():
    ctx = SpeechContext()
    ctx.update("Ms. Jane Smith talked about 5000 units.", 1)
    
    ctx_str = ctx.to_context_string()
    assert "Jane Smith" in ctx_str
    assert "person, female" in ctx_str
    assert "5000 units" in ctx_str
    assert "metric" in ctx_str
    assert ctx_str.startswith("[Context:")
