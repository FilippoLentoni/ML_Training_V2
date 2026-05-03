import argparse

import evaluation
import preprocessing


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--processing-type", type=str, choices=["preprocessing", "evaluation"], default="preprocessing")
    args, _ = parser.parse_known_args()
    return args


def main() -> None:
    args = parse_args()
    if args.processing_type == "preprocessing":
        preprocessing.main()
    elif args.processing_type == "evaluation":
        evaluation.main()


if __name__ == "__main__":
    main()
