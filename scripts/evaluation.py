import logging
import os
import pickle
import tarfile

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_score, roc_auc_score

DEFAULT_TEST_DATA_LOCAL_PATH = "/opt/ml/processing/input/test/"
DEFAULT_MODEL_LOCAL_PATH = "/opt/ml/processing/input/model/"

logging.basicConfig(level=logging.INFO)


def evaluate_model(model: RandomForestClassifier, attributes: pd.DataFrame, labels: pd.Series) -> tuple[float, float]:
    predicted_labels = model.predict(attributes)
    predicted_probability = model.predict_proba(attributes)[:, 1]
    return roc_auc_score(labels, predicted_probability), precision_score(labels, predicted_labels)


def main() -> None:
    with open(os.path.join(DEFAULT_TEST_DATA_LOCAL_PATH, "attributes.pkl"), "rb") as file:
        test_attributes = pickle.load(file)
    with open(os.path.join(DEFAULT_TEST_DATA_LOCAL_PATH, "labels.pkl"), "rb") as file:
        test_labels = pickle.load(file)

    with tarfile.open(os.path.join(DEFAULT_MODEL_LOCAL_PATH, "model.tar.gz"), "r:gz") as tar:
        tar.extractall(DEFAULT_MODEL_LOCAL_PATH)
    with open(os.path.join(DEFAULT_MODEL_LOCAL_PATH, "model.pkl"), "rb") as file:
        model = pickle.load(file)

    roc_auc, precision = evaluate_model(model, test_attributes, test_labels)
    logging.info("ROC AUC score: %s", roc_auc)
    logging.info("Precision score: %s", precision)


if __name__ == "__main__":
    main()
