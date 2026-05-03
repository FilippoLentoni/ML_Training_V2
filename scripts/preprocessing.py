import logging
import os
import pickle
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

DEFAULT_DATA_PATH = "/opt/ml/processing/input/"
DEFAULT_DATA_FILE_NAME = "data.csv"
DEFAULT_OUTPUT_PATH = "/opt/ml/processing/output/"
TRAIN_PERCENTAGE = 0.8
TEST_PERCENTAGE = 0.1
FEATURES = ["Age", "SibSp", "Parch", "Fare"]
TARGET = "Survived"

logging.basicConfig(level=logging.INFO)


def train_validation_test_split(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    train_validation, test = train_test_split(
        data,
        test_size=TEST_PERCENTAGE,
        stratify=data[TARGET],
        random_state=42,
    )
    train, validation = train_test_split(
        train_validation,
        train_size=TRAIN_PERCENTAGE / (1 - TEST_PERCENTAGE),
        stratify=train_validation[TARGET],
        random_state=42,
    )
    return train, validation, test


def preprocess_data(
    data: pd.DataFrame,
    fold_name: str,
    scaler: StandardScaler | None = None,
) -> tuple[pd.DataFrame, pd.Series, StandardScaler]:
    logging.info("Processing %s fold.", fold_name)
    data = data[FEATURES + [TARGET]].dropna()

    if scaler is None:
        scaler = StandardScaler()
        scaler = scaler.fit(data[FEATURES])

    data[FEATURES] = scaler.transform(data[FEATURES])
    attributes = data.drop(TARGET, axis=1)
    labels = data[TARGET]

    output_dir = os.path.join(DEFAULT_OUTPUT_PATH, fold_name)
    with open(os.path.join(output_dir, "attributes.pkl"), "wb") as file:
        pickle.dump(attributes, file)
    with open(os.path.join(output_dir, "labels.pkl"), "wb") as file:
        pickle.dump(labels, file)

    return attributes, labels, scaler


def main() -> None:
    for fold in ["train", "validation", "test", "artifacts", "total"]:
        Path(os.path.join(DEFAULT_OUTPUT_PATH, fold)).mkdir(parents=True, exist_ok=True)

    logging.info("Reading raw data.")
    data = pd.read_csv(os.path.join(DEFAULT_DATA_PATH, DEFAULT_DATA_FILE_NAME))

    logging.info("Splitting into train, validation, and test folds.")
    train, validation, test = train_validation_test_split(data)

    train_attributes, train_labels, scaler = preprocess_data(train, "train")
    validation_attributes, validation_labels, _ = preprocess_data(validation, "validation", scaler)
    preprocess_data(test, "test", scaler)

    logging.info("Saving preprocessing artifacts.")
    with open(os.path.join(DEFAULT_OUTPUT_PATH, "artifacts", "scaler.pkl"), "wb") as file:
        pickle.dump(scaler, file)

    logging.info("Aggregating train and validation data for final training.")
    total_attributes = pd.concat([train_attributes, validation_attributes], axis=0).reset_index(drop=True)
    total_labels = pd.concat([train_labels, validation_labels], axis=0).reset_index(drop=True)

    with open(os.path.join(DEFAULT_OUTPUT_PATH, "total", "attributes.pkl"), "wb") as file:
        pickle.dump(total_attributes, file)
    with open(os.path.join(DEFAULT_OUTPUT_PATH, "total", "labels.pkl"), "wb") as file:
        pickle.dump(total_labels, file)

    logging.info("Processing job completed.")


if __name__ == "__main__":
    main()
