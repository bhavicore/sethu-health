"""Task 9: score the full processed dataset with its best model and store predictions in Mongo."""
import json
import os
import sys

from pyspark.ml.classification import (
    GBTClassificationModel,
    LogisticRegressionModel,
    RandomForestClassificationModel,
)
from pyspark.ml.functions import vector_to_array
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "src"))
from dataset_config import DATASETS  # noqa: E402

PROCESSED_DIR = os.path.join(BASE, "data", "processed")
RESULTS_DIR = os.path.join(BASE, "results")

MODEL_LOADERS = {
    "LogisticRegression": LogisticRegressionModel,
    "RandomForestClassifier": RandomForestClassificationModel,
    "GBTClassifier": GBTClassificationModel,
}

try:
    import pymongo
    MongoClient = pymongo.MongoClient
    USING_REAL_MONGO = True
except ImportError:
    from mongomock import MongoClient
    USING_REAL_MONGO = False


def get_mongo_client():
    if USING_REAL_MONGO:
        try:
            client = MongoClient(serverSelectionTimeoutMS=1500)
            client.admin.command("ping")
            return client, True
        except Exception:
            from mongomock import MongoClient as MockClient
            return MockClient(), False
    return MongoClient(), False


def score_and_store(spark, db, name, cfg, model_info):
    print(f"\n=== store: {name} ===")
    df = spark.read.parquet(os.path.join(PROCESSED_DIR, name))

    model_cls = MODEL_LOADERS[model_info["best_model"]]
    model = model_cls.load(model_info["model_path"])
    predictions = model.transform(df)

    predictions = predictions.withColumn(
        "probability_positive", vector_to_array(F.col("probability"))[1]
    )
    predictions = predictions.withColumn("patient_id", F.monotonically_increasing_id())

    records = (
        predictions.select("patient_id", "label", "prediction", "probability_positive")
        .withColumn("disease", F.lit(name))
        .withColumn("model_used", F.lit(model_info["best_model"]))
        .toPandas()
        .to_dict(orient="records")
    )

    collection_name = f"{name}_predictions"
    collection = db[collection_name]
    collection.delete_many({})
    if records:
        collection.insert_many(records)

    n_at_risk = collection.count_documents({"prediction": 1.0})
    n_records = collection.count_documents({})
    print(f"[store] {name}: inserted {n_records} docs into {collection_name}, n_at_risk={n_at_risk}")

    return {"n_records": n_records, "n_at_risk": n_at_risk, "collection": collection_name}


def main():
    spark = SparkSession.builder.appName("mdrp-store-results").master("local[*]").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    with open(os.path.join(RESULTS_DIR, "model_metrics.json")) as f:
        model_metrics = json.load(f)

    client, is_real_mongo = get_mongo_client()
    db = client["mdrp"]
    print(f"[store] using {'real MongoDB' if is_real_mongo else 'mongomock (in-memory)'} backend")

    summary = {"backend": "mongodb" if is_real_mongo else "mongomock", "diseases": {}}
    try:
        for name, cfg in DATASETS.items():
            summary["diseases"][name] = score_and_store(spark, db, name, cfg, model_metrics[name])
    finally:
        spark.stop()
        client.close()

    out_path = os.path.join(RESULTS_DIR, "storage_summary.json")
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n[store] wrote {out_path}")


if __name__ == "__main__":
    main()
