# Multi-Disease Risk Prediction Pipeline (MDRP)

A Spark-based batch pipeline that trains and scores risk models for five diseases —
cardiovascular disease, diabetes, chronic kidney disease (CKD), liver disease, and
stroke — from independent Kaggle datasets, and stores per-patient predictions in
MongoDB (or an in-memory mongomock fallback).

## How to run

```bash
pip install -r requirements.txt
python run_all.py
```

Requires Java 17+ (Spark) and Python 3.10+. Raw CSVs must already be in `data/raw/`
(`heart.csv`, `diabetes.csv`, `kidney.csv`, `liver.csv`, `stroke.csv`).

Each stage can also be run individually, in order:

```bash
python3 src/ingest.py
python3 src/preprocess.py
python3 src/train_models.py
python3 src/query_analysis.py
python3 src/store_results.py
```

## Pipeline stages

1. **`src/ingest.py`** — copies each raw CSV into the simulated HDFS layout
   (`hdfs_sim/raw/<name>/<name>.csv`) and writes a data quality report
   (row/column counts, duplicates, missing values) to `results/data_quality_report.json`.
2. **`src/preprocess.py`** — Spark job per dataset: casts the label to 0/1, drops
   null-label rows, median-imputes numeric columns, string-indexes categoricals,
   assembles + standard-scales the feature vector, and writes Parquet to
   `data/processed/<name>/`. Per-dataset schema (columns, label encoding, delimiter)
   lives in `src/dataset_config.py`, since the five datasets don't share a schema.
3. **`src/train_models.py`** — trains Logistic Regression, Random Forest
   (100 trees, depth 6), and GBT (50 iterations, depth 5) per dataset on an 80/20
   split (seed 42), evaluates accuracy/precision/recall/F1/ROC-AUC, and keeps the
   best model by ROC-AUC. Stroke's positive rate is under 10%, so its Logistic
   Regression is trained with an inverse-frequency `weightCol` to avoid a
   majority-class-only model. Metrics land in `results/model_metrics.json`.
4. **`src/query_analysis.py`** — Spark SQL: risk prevalence by age bucket
   (`<30`, `30-44`, `45-59`, `60-74`, `75+`) per dataset (kidney has no age field
   and is skipped), plus a cross-disease ROC-AUC comparison table. Output in
   `results/query_analysis.json`.
5. **`src/store_results.py`** — scores the full processed dataset with each
   disease's best model and upserts one document per patient into a
   `<name>_predictions` MongoDB collection (falls back to `mongomock` if no
   MongoDB is reachable). Summary in `results/storage_summary.json`.

`run_all.py` chains all five stages via `subprocess`, stopping on the first
non-zero exit code.

## Headline results (ROC-AUC, best model per disease)

| Disease    | Rows    | Positive rate | Best model            | ROC-AUC | Accuracy | F1     |
|------------|--------:|---------------:|------------------------|--------:|---------:|-------:|
| Heart      | 70,000  | 49.97%          | GBTClassifier          | 0.8014  | 0.7323   | 0.7317 |
| Diabetes   | 253,680 | 13.93%          | GBTClassifier          | 0.8206  | 0.8649   | 0.8280 |
| Kidney     | 4,000   | 96.88%          | LogisticRegression     | 0.9992  | 0.9933   | 0.9930 |
| Liver      | 30,691  | 71.41%          | GBTClassifier          | 0.9966  | 0.9848   | 0.9847 |
| Stroke     | 5,110   | 4.87%           | RandomForestClassifier | 0.8637  | 0.9433   | 0.9157 |

Full per-model metrics are in `results/model_metrics.json`.
