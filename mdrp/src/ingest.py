"""Task 5: copy raw CSVs into the simulated HDFS layout and run data quality checks."""
import csv
import json
import os
import shutil
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "src"))
from dataset_config import DATASETS  # noqa: E402

RAW_DIR = os.path.join(BASE, "data", "raw")
HDFS_RAW_DIR = os.path.join(BASE, "hdfs_sim", "raw")
RESULTS_DIR = os.path.join(BASE, "results")


def put_to_hdfs_sim(name, raw_file):
    """Stand-in for `hdfs dfs -put`: copy into hdfs_sim/raw/<name>/<name>.csv."""
    src = os.path.join(RAW_DIR, raw_file)
    dest_dir = os.path.join(HDFS_RAW_DIR, name)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, f"{name}.csv")
    shutil.copyfile(src, dest)
    return dest


def data_quality_report(path, delimiter):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter=delimiter)
        header = next(reader)
        n_cols = len(header)
        missing_per_col = {col: 0 for col in header}
        seen_rows = {}
        row_count = 0
        duplicate_count = 0
        for row in reader:
            row_count += 1
            for col, val in zip(header, row):
                if val is None or val.strip() == "" or val.strip().upper() in ("N/A", "NA", "NULL"):
                    missing_per_col[col] += 1
            key = tuple(row)
            if key in seen_rows:
                duplicate_count += 1
            else:
                seen_rows[key] = True

    total_cells = row_count * n_cols
    total_missing = sum(missing_per_col.values())
    missing_pct_overall = round(100.0 * total_missing / total_cells, 4) if total_cells else 0.0

    return {
        "row_count": row_count,
        "column_count": n_cols,
        "columns": header,
        "duplicate_row_count": duplicate_count,
        "missing_values_per_column": missing_per_col,
        "missing_pct_overall": missing_pct_overall,
    }


def main():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    report = {}
    for name, cfg in DATASETS.items():
        dest = put_to_hdfs_sim(name, cfg["raw_file"])
        print(f"[ingest] {name}: put {cfg['raw_file']} -> {dest}")
        dq = data_quality_report(dest, cfg["delimiter"])
        print(f"[ingest] {name}: rows={dq['row_count']} cols={dq['column_count']} "
              f"dupes={dq['duplicate_row_count']} missing%={dq['missing_pct_overall']}")
        report[name] = dq

    out_path = os.path.join(RESULTS_DIR, "data_quality_report.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"[ingest] wrote {out_path}")


if __name__ == "__main__":
    main()
