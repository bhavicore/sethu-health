"""Task 10: run the full pipeline (ingest -> preprocess -> train -> query -> store) in order."""
import subprocess
import sys

STEPS = [
    ["python3", "src/ingest.py"],
    ["python3", "src/preprocess.py"],
    ["python3", "src/train_models.py"],
    ["python3", "src/query_analysis.py"],
    ["python3", "src/store_results.py"],
]


def main():
    for step in STEPS:
        print(f"\n>>> running: {' '.join(step)}")
        result = subprocess.run(step)
        if result.returncode != 0:
            print(f"!!! step failed: {' '.join(step)} (exit {result.returncode})")
            sys.exit(result.returncode)
    print("\n>>> pipeline complete")


if __name__ == "__main__":
    main()
