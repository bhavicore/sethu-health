"""Per-dataset schema configuration for the multi-disease risk pipeline.

Column names, label encodings, and delimiters were read directly from each
raw CSV's header (see AGENT_TASKS.md Task 4) rather than assumed from the
Kaggle listing pages, since several datasets deviate from their common
public column layouts.
"""

DATASETS = {
    "heart": {
        "raw_file": "heart.csv",
        "delimiter": ";",
        "label_col": "cardio",
        "positive_value": 1,
        "drop_cols": ["id"],
        "numeric_cols": ["age", "height", "weight", "ap_hi", "ap_lo"],
        "categorical_cols": ["gender", "cholesterol", "gluc", "smoke", "alco", "active"],
        "age_col": "age",
        "age_unit": "days",
    },
    "diabetes": {
        "raw_file": "diabetes.csv",
        "delimiter": ",",
        "label_col": "Diabetes_binary",
        "positive_value": 1,
        "drop_cols": [],
        "numeric_cols": ["BMI", "GenHlth", "MentHlth", "PhysHlth", "Education", "Income"],
        "categorical_cols": [
            "HighBP", "HighChol", "CholCheck", "Smoker", "Stroke",
            "HeartDiseaseorAttack", "PhysActivity", "Fruits", "Veggies",
            "HvyAlcoholConsump", "AnyHealthcare", "NoDocbcCost", "DiffWalk", "Sex",
        ],
        # BRFSS codes 1-13 for 5-year age bands (1=18-24 ... 13=80+), not raw age.
        "age_col": "Age",
        "age_unit": "brfss_code",
    },
    "kidney": {
        "raw_file": "kidney.csv",
        "delimiter": ",",
        "label_col": "ckd_pred",
        "positive_value": "CKD",
        # ckd_stage and cluster are derived/post-hoc labels that leak the target.
        "drop_cols": ["ckd_stage", "cluster"],
        "numeric_cols": [
            "serum_creatinine", "gfr", "bun", "serum_calcium", "ana", "c3_c4",
            "hematuria", "oxalate_levels", "urine_ph", "blood_pressure",
            "water_intake", "months",
        ],
        "categorical_cols": [
            "physical_activity", "diet", "smoking", "alcohol",
            "painkiller_usage", "family_history", "weight_changes", "stress_level",
        ],
        # No age field exists in this dataset.
        "age_col": None,
        "age_unit": None,
    },
    "liver": {
        "raw_file": "liver.csv",
        "delimiter": ",",
        "label_col": "Result",
        "positive_value": 1,
        "drop_cols": [],
        "numeric_cols": [
            "Age of the patient", "Total Bilirubin", "Direct Bilirubin",
            "Alkphos Alkaline Phosphotase", "Sgpt Alamine Aminotransferase",
            "Sgot Aspartate Aminotransferase", "Total Protiens", "ALB Albumin",
            "A/G Ratio Albumin and Globulin Ratio",
        ],
        "categorical_cols": ["Gender of the patient"],
        "age_col": "Age of the patient",
        "age_unit": "years",
        # The raw header carries stray non-ASCII bytes before a few names
        # (e.g. "Alkphos Alkaline Phosphotase"); strip them on read.
        "clean_column_names": True,
    },
    "stroke": {
        "raw_file": "stroke.csv",
        "delimiter": ",",
        "label_col": "stroke",
        "positive_value": 1,
        "drop_cols": ["id"],
        "numeric_cols": ["age", "hypertension", "heart_disease", "avg_glucose_level", "bmi"],
        "categorical_cols": ["gender", "ever_married", "work_type", "Residence_type", "smoking_status"],
        "age_col": "age",
        "age_unit": "years",
    },
}

# BRFSS 5-year age-group code -> our shared bucket scheme.
BRFSS_AGE_BUCKET = {
    1: "<30", 2: "<30",
    3: "30-44", 4: "30-44", 5: "30-44",
    6: "45-59", 7: "45-59", 8: "45-59",
    9: "60-74", 10: "60-74", 11: "60-74",
    12: "75+", 13: "75+",
}

AGE_BUCKETS = ["<30", "30-44", "45-59", "60-74", "75+"]


def age_bucket_years(age_years):
    if age_years is None:
        return None
    if age_years < 30:
        return "<30"
    if age_years < 45:
        return "30-44"
    if age_years < 60:
        return "45-59"
    if age_years < 75:
        return "60-74"
    return "75+"
