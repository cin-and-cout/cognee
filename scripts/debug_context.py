import os
from pathlib import Path
import asyncio

from dotenv import load_dotenv
load_dotenv()

# Resolve paths to absolute to prevent cognee validation errors
base_dir = Path(__file__).parent.parent.absolute()
os.environ["DATA_ROOT_DIRECTORY"] = str(base_dir / ".cognee_data")
os.environ["COGNIFY_SYSTEM_DIRECTORY"] = str(base_dir / ".cognee_system")
os.environ["LLM_API_KEY"] = os.environ.get("LLM_API_KEY", "") # Ensure an API key exists or relies on dotenv

from collections import deque
from app.services.claim_extractor import extract_claim_from_text
from app.services.coreference import SpeechContext, has_references

async def debug_context():
    sentence_history = deque(maxlen=5)
    speech_context = SpeechContext()
    
    sentences = [
        "Governor Sarah Chen announced a new housing initiative on Monday.",
        "Under the plan, 50,000 new affordable units will be built by 2027.",
        "She expects this to reduce rental costs by 12% within two years."
    ]
    
    print("\n" + "="*50)
    print("🧠 CONTEXT INJECTION DEBUGGER")
    print("="*50 + "\n")
    
    for i, sentence in enumerate(sentences):
        print(f"\n--- [Sentence {i+1}] ---")
        print(f"📝 Raw Input : {sentence}")
        
        # Test reference heuristic
        has_ref = has_references(sentence)
        print(f"🔍 References Detected: {has_ref}")
        
        # Phase 1: Context resolution check
        context_prefix = ""
        if has_ref:
            if not speech_context.is_empty():
                context_prefix = speech_context.to_context_string() + "\n"
                print(f"💉 Injected Context : {context_prefix.strip()}")
            elif sentence_history:
                context_prefix = " ".join(list(sentence_history)[-2:]) + "\n"
                print(f"💉 Fallback History : {context_prefix.strip()}")
        
        # Add to history
        sentence_history.append(sentence)
        
        # Extract Claim
        print("⏳ Extracting claim via LLM...")
        claim = await extract_claim_from_text(
            text=sentence,
            politician_name="Unknown Speaker",
            claim_date="2026-07-05",
            sentence_history=sentence_history,
            speech_context=speech_context
        )
        
        if claim:
            print(f"🎯 Extracted Statement: {claim.statement}")
            if claim.is_numeric:
                print(f"📊 Numeric Data: {claim.value} {claim.unit} ({claim.metric})")
        else:
            print("🤷 No actionable claim extracted.")
            
        # Phase 3: Update SpeechContext
        speech_context.update(sentence, i)
        print(f"🧠 Entity State Now : {speech_context.to_context_string()}")
        print("-" * 50)

if __name__ == "__main__":
    asyncio.run(debug_context())
