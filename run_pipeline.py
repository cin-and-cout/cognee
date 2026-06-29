import argparse
import asyncio
import os
import sys

from app.services.orchestrator import process_incoming_sentence

DEFAULT_SENTENCES = [
    "I am proud to report that inflation has now dropped to 2.8% this month.",
    "Unemployment has slightly risen to 4.5% due to seasonal adjustments.",
    "We are freezing passenger fares for all public transit routes indefinitely.",
    "We have successfully built 12,000 affordable homes across the metropolitan area.",
]


async def run(input_file: str = None):
    if input_file:
        if not os.path.exists(input_file):
            print(f"Error: Input file '{input_file}' not found.")
            sys.exit(1)
        with open(input_file, "r", encoding="utf-8") as f:
            sentences = [line.strip() for line in f if line.strip()]
    else:
        sentences = DEFAULT_SENTENCES

    print("=" * 80)
    print("                    CLAIM CONSISTENCY TRACKER PIPELINE RUNNER                    ")
    print("=" * 80)
    print(f"Processing {len(sentences)} sentence(s)...")
    print("-" * 80)

    for i, sentence in enumerate(sentences, 1):
        print(f'\n[{i}/{len(sentences)}] Processing Sentence: "{sentence}"')
        report = await process_incoming_sentence(
            text=sentence,
            politician_name="Governor Alexis Vance",
            claim_date="2026-06-29",
            politician_party="Progressive Coalition",
        )
        if not report:
            print("  Result: No checkable claim found in this sentence.")
            continue

        new_claim = report["new_claim"]
        hist_claim = report["historical_claim"]
        verdict = report["verdict"]

        print("  Extracted Claim:")
        print(f"    Topic:       {new_claim['topic']}")
        print(f"    Statement:   {new_claim['statement']}")
        print(f"    Is Numeric:  {new_claim['is_numeric']}")
        if new_claim["is_numeric"]:
            print(f"    Value/Unit:  {new_claim['value']} {new_claim['unit']}")

        if hist_claim:
            print(f"  Latest Historical Claim (on {hist_claim['claim_date']}):")
            print(f"    Statement:   {hist_claim['statement']}")
            if hist_claim["is_numeric"]:
                print(f"    Value/Unit:  {hist_claim['value']} {hist_claim['unit']}")
        else:
            print("  Latest Historical Claim: None found.")

        print("  Comparison Verdict:")
        print(f"    Verdict:     {verdict['label']}")
        print(f"    Explanation: {verdict['explanation']}")
        print(f"    Type:        {verdict['type']}")
    print("=" * 80)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run Claim Consistency Tracker Pipeline",
    )
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Path to file containing speech sentences (one per line).",
    )
    args = parser.parse_args()

    asyncio.run(run(args.input))
