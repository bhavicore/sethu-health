"""Task 6: per-dataset Spark preprocessing -> Parquet under data/processed/<name>/."""
import os
import re
import shutil
import sys

from pyspark.ml import Pipeline
from pyspark.ml.feature import Imputer, StandardScaler, StringIndexer, VectorAssembler
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "src"))
from dataset_config import DATASETS  # noqa: E402

HDFS_RAW_DIR = os.path.join(BASE, "hdfs_sim", "raw")
PROCESSED_DIR = os.path.join(BASE, "data", "processed")


def clean_columns(df):
    """Strip stray non-ASCII bytes/whitespace from column names (liver.csv header)."""
    renamed = [re.sub(r"[^\x00-\x7F]+", "", c).strip() for c in df.columns]
    return df.toDF(*renamed)


def process_dataset(spark, name, cfg):
    print(f"\n=== preprocess: {name} ===")
    path = os.path.join(HDFS_RAW_DIR, name, f"{name}.csv")
    df = (
        spark.read.option("header", "true")
        .option("inferSchema", "true")
        .option("delimiter", cfg["delimiter"])
        .option("nullValue", "N/A")
        .csv(path)
    )
    if cfg.get("clean_column_names"):
        df = clean_columns(df)

    label_col = cfg["label_col"]
    positive_value = cfg["positive_value"]
    numeric_cols = cfg["numeric_cols"]
    categorical_cols = cfg["categorical_cols"]
    drop_cols = cfg.get("drop_cols", [])

    # Keep original columns (minus dropped leak/id columns) for downstream storage.
    original_cols = [c for c in df.columns if c not in drop_cols]
    df = df.select(*original_cols)

    # 2 & 3: cast label to 0/1 int, drop rows with null label.
    df = df.filter(F.col(label_col).isNotNull())
    if isinstance(positive_value, str):
        label_match = F.col(label_col).cast("string") == positive_value
    else:
        label_match = F.col(label_col).cast("double") == float(positive_value)
    df = df.withColumn("label", F.when(label_match, 1).otherwise(0).cast("int"))

    # Cast numeric feature columns to double so Imputer/Scaler can operate on them.
    for c in numeric_cols:
        df = df.withColumn(c, F.col(c).cast(DoubleType()))

    # Cast categorical columns to string for StringIndexer.
    for c in categorical_cols:
        df = df.withColumn(c, F.col(c).cast("string"))

    imputer = Imputer(inputCols=numeric_cols, outputCols=[f"{c}_imp" for c in numeric_cols], strategy="median")

    indexers = [
        StringIndexer(inputCol=c, outputCol=f"{c}_idx", handleInvalid="keep")
        for c in categorical_cols
    ]

    assembler_inputs = [f"{c}_imp" for c in numeric_cols] + [f"{c}_idx" for c in categorical_cols]
    assembler = VectorAssembler(inputCols=assembler_inputs, outputCol="features_raw")
    scaler = StandardScaler(inputCol="features_raw", outputCol="features", withMean=True, withStd=True)

    pipeline = Pipeline(stages=[imputer] + indexers + [assembler, scaler])
    model = pipeline.fit(df)
    transformed = model.transform(df)

    output_cols = ["label", "features"] + original_cols
    result = transformed.select(*output_cols)

    out_dir = os.path.join(PROCESSED_DIR, name)
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    result.write.mode("overwrite").parquet(out_dir)

    n = result.count()
    n_pos = result.filter(F.col("label") == 1).count()
    print(f"[preprocess] {name}: wrote {n} rows to {out_dir} (positive rate={n_pos / n:.4f})")


def main():
    spark = SparkSession.builder.appName("mdrp-preprocess").master("local[*]").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    try:
        for name, cfg in DATASETS.items():
            process_dataset(spark, name, cfg)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
