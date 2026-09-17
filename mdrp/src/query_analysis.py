"""Task 8: Spark SQL analysis - risk prevalence by age group, and cross-disease ROC-AUC comparison."""
import json
import os
import sys

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StringType

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "src"))
from dataset_config import AGE_BUCKETS, DATASETS  # noqa: E402

PROCESSED_DIR = os.path.join(BASE, "data", "processed")
RESULTS_DIR = os.path.join(BASE, "results")


def _bucket_from_years(age_years):
    if age_years < 30:
        return "<30"
    if age_years < 45:
        return "30-44"
    if age_years < 60:
        return "45-59"
    if age_years < 75:
        return "60-74"
    return "75+"


def brfss_bucket_udf():
    # BRFSS 5-year age-group code (1-13) -> our shared bucket scheme, inlined
    # so the closure has no dependency to ship to Spark workers.
    mapping = {
        1: "<30", 2: "<30",
        3: "30-44", 4: "30-44", 5: "30-44",
        6: "45-59", 7: "45-59", 8: "45-59",
        9: "60-74", 10: "60-74", 11: "60-74",
        12: "75+", 13: "75+",
    }

    def f(code):
        if code is None:
            return None
        return mapping.get(int(code))

    return F.udf(f, StringType())


def age_years_bucket_udf():
    def f(age):
        if age is None:
            return None
        return _bucket_from_years(float(age))

    return F.udf(f, StringType())


def days_to_years_bucket_udf():
    def f(days):
        if days is None:
            return None
        return _bucket_from_years(float(days) / 365.25)

    return F.udf(f, StringType())


def risk_prevalence_by_age(spark, name, cfg):
    age_col = cfg.get("age_col")
    if age_col is None:
        return None

    df = spark.read.parquet(os.path.join(PROCESSED_DIR, name)).select("label", age_col)
    unit = cfg["age_unit"]
    if unit == "brfss_code":
        bucketed = df.withColumn("age_bucket", brfss_bucket_udf()(F.col(age_col)))
    elif unit == "days":
        bucketed = df.withColumn("age_bucket", days_to_years_bucket_udf()(F.col(age_col)))
    else:
        bucketed = df.withColumn("age_bucket", age_years_bucket_udf()(F.col(age_col)))

    bucketed.createOrReplaceTempView(f"{name}_bucketed")
    rows = spark.sql(f"""
        SELECT age_bucket,
               COUNT(*) AS n,
               SUM(label) AS n_positive,
               ROUND(AVG(label), 4) AS risk_prevalence
        FROM {name}_bucketed
        WHERE age_bucket IS NOT NULL
        GROUP BY age_bucket
    """).collect()

    result = {b: None for b in AGE_BUCKETS}
    for row in rows:
        result[row["age_bucket"]] = {
            "n": row["n"],
            "n_positive": row["n_positive"],
            "risk_prevalence": row["risk_prevalence"],
        }
    return result


def model_roc_auc_comparison():
    with open(os.path.join(RESULTS_DIR, "model_metrics.json")) as f:
        model_metrics = json.load(f)

    comparison = {}
    for name, info in model_metrics.items():
        comparison[name] = {
            model_name: round(m["roc_auc"], 4)
            for model_name, m in info["metrics_by_model"].items()
        }
        comparison[name]["best_model"] = info["best_model"]
    return comparison


def main():
    spark = SparkSession.builder.appName("mdrp-query-analysis").master("local[*]").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    risk_prevalence = {}
    try:
        for name, cfg in DATASETS.items():
            prevalence = risk_prevalence_by_age(spark, name, cfg)
            risk_prevalence[name] = prevalence
            if prevalence is None:
                print(f"[query] {name}: no age column, skipping age-bucketed prevalence")
            else:
                print(f"[query] {name}: risk_prevalence_by_age = {prevalence}")
    finally:
        spark.stop()

    comparison = model_roc_auc_comparison()
    print(f"[query] model_roc_auc_comparison = {comparison}")

    output = {
        "risk_prevalence_by_age": risk_prevalence,
        "model_roc_auc_comparison": comparison,
    }
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = os.path.join(RESULTS_DIR, "query_analysis.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"[query] wrote {out_path}")


if __name__ == "__main__":
    main()
