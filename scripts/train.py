import argparse
import logging
import os
import pickle

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score

DEFAULT_NUM_ESTIMATORS = 100

logging.basicConfig(level=logging.INFO)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=str, default=os.environ.get("SM_MODEL_DIR", "/opt/ml/model"))
    parser.add_argument("--train", type=str, default=os.environ.get("SM_CHANNEL_TRAIN", "/opt/ml/input/data/train"))
    parser.add_argument("--validation", type=str, default=os.environ.get("SM_CHANNEL_VALIDATION", "/opt/ml/input/data/validation"))
    parser.add_argument("--num_estimators", type=int, default=DEFAULT_NUM_ESTIMATORS)
    args, _ = parser.parse_known_args()
    return args


def run_with_args(args: argparse.Namespace) -> None:
    if args.train is None:
        raise ValueError("A train channel is required.")

    logging.info("Loading training data.")
    with open(os.path.join(args.train, "attributes.pkl"), "rb") as file:
        train_attributes = pickle.load(file)
    with open(os.path.join(args.train, "labels.pkl"), "rb") as file:
        train_labels = pickle.load(file)

    model = RandomForestClassifier(random_state=42, n_estimators=args.num_estimators)
    model.fit(train_attributes, train_labels)

    if args.validation is not None and os.path.exists(args.validation):
        with open(os.path.join(args.validation, "attributes.pkl"), "rb") as file:
            validation_attributes = pickle.load(file)
        with open(os.path.join(args.validation, "labels.pkl"), "rb") as file:
            validation_labels = pickle.load(file)

        predicted_probability = model.predict_proba(validation_attributes)[:, 1]
        roc_auc = roc_auc_score(validation_labels, predicted_probability)
        logging.info("Validation ROC AUC: %s", roc_auc)

    os.makedirs(args.model_dir, exist_ok=True)
    with open(os.path.join(args.model_dir, "model.pkl"), "wb") as file:
        pickle.dump(model, file)


def main() -> None:
    run_with_args(parse_args())


if __name__ == "__main__":
    main()
