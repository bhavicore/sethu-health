"""Task 7: train/evaluate LR, RF, GBT per dataset and save the best model by ROC-AUC."""
import json
import os
import shutil
import sys

from pyspark.ml.classification import GBTClassifier, LogisticRegression, RandomForestClassifier
from pyspark.ml.evaluation import BinaryClassificationEvaluator, MulticlassClassificationEvaluator
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "src"))
from dataset_config import DATASETS  # noqa: E402

PROCESSED_DIR = os.path.join(BASE, "data", "processed")
MODELS_DIR = os.path.join(BASE, "models")
RESULTS_DIR = os.path.join(BASE, "results")

SEED = 42


def add_class_weight(df):
    """Balance minority/majority classes via an instance weight column."""
    counts = df.groupBy("label").count().collect()
    counts = {row["label"]: row["count"] for row in counts}
    total = sum(counts.values())
    n_classes = len(counts)
    weights = {lbl: total / (n_classes * cnt) for lbl, cnt in counts.items()}
    weight_expr = F.create_map([F.lit(x) for pair in weights.items() for x in pair])
    return df.withColumn("weight", weight_expr[F.col("label")].cast("double"))


def evaluate(predictions):
    mce = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction")
    bce = BinaryClassificationEvaluator(labelCol="label", rawPredictionCol="rawPrediction", metricName="areaUnderROC")
    return {
        "accuracy": mce.evaluate(predictions, {mce.metricName: "accuracy"}),
        "precision": mce.evaluate(predictions, {mce.metricName: "weightedPrecision"}),
        "recall": mce.evaluate(predictions, {mce.metricName: "weightedRecall"}),
        "f1": mce.evaluate(predictions, {mce.metricName: "f1"}),
        "roc_auc": bce.evaluate(predictions),
    }


def train_dataset(spark, name, cfg):
    print(f"\n=== train: {name} ===")
    df = spark.read.parquet(os.path.join(PROCESSED_DIR, name)).select("label", "features")
    train_df, test_df = df.randomSplit([0.8, 0.2], seed=SEED)

    n_pos = df.filter(F.col("label") == 1).count()
    n = df.count()
    positive_rate = n_pos / n
    use_class_weight = name == "stroke" and positive_rate < 0.10
    if use_class_weight:
        print(f"[train] {name}: positive_rate={positive_rate:.4f} < 10% -> applying class weighting")
        train_df = add_class_weight(train_df)

    lr_kwargs = dict(labelCol="label", featuresCol="features")
    if use_class_weight:
        lr_kwargs["weightCol"] = "weight"
    models = {
        "LogisticRegression": LogisticRegression(**lr_kwargs),
        "RandomForestClassifier": RandomForestClassifier(
            labelCol="label", featuresCol="features", numTrees=100, maxDepth=6, seed=SEED
        ),
        "GBTClassifier": GBTClassifier(
            labelCol="label", featuresCol="features", maxIter=50, maxDepth=5, seed=SEED
        ),
    }

    metrics = {}
    fitted = {}
    for model_name, estimator in models.items():
        model = estimator.fit(train_df)
        preds = model.transform(test_df)
        m = evaluate(preds)
        metrics[model_name] = m
        fitted[model_name] = model
        print(f"[train] {name}/{model_name}: acc={m['accuracy']:.4f} f1={m['f1']:.4f} roc_auc={m['roc_auc']:.4f}")

    best_model_name = max(metrics, key=lambda k: metrics[k]["roc_auc"])
    best_model = fitted[best_model_name]
    best_metrics = metrics[best_model_name]

    out_dir = os.path.join(MODELS_DIR, name, best_model_name)
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(os.path.dirname(out_dir), exist_ok=True)
    best_model.write().overwrite().save(out_dir)
    print(f"[train] {name}: best_model={best_model_name} roc_auc={best_metrics['roc_auc']:.4f} -> {out_dir}")

    return {
        "n_rows": n,
        "positive_rate": positive_rate,
        "class_weighting_applied": use_class_weight,
        "metrics_by_model": metrics,
        "best_model": best_model_name,
        "best_metrics": best_metrics,
        "model_path": out_dir,
    }


def main():
    spark = SparkSession.builder.appName("mdrp-train").master("local[*]").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    report = {}
    try:
        for name, cfg in DATASETS.items():
            report[name] = train_dataset(spark, name, cfg)
    finally:
        spark.stop()

    out_path = os.path.join(RESULTS_DIR, "model_metrics.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n[train] wrote {out_path}")


if __name__ == "__main__":
    main()
