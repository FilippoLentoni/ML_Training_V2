# Burner Model Training on SageMaker

This is a public AWS CDK implementation of a SageMaker training workflow. It deploys a containerized Random Forest training image, an encrypted S3 data bucket, a SageMaker execution role, and a SageMaker Pipeline with four steps:

1. preprocess input CSV data into train, validation, test, and final-training folds
2. tune `num_estimators` with SageMaker hyperparameter tuning
3. train a final Random Forest model on the combined train and validation data
4. evaluate the final model on the held-out test data

## Architecture

- AWS CDK v2 TypeScript app
- Docker image asset uploaded to Amazon ECR by CDK
- Amazon S3 for input data, processed folds, tuning output, model artifacts, and logs
- AWS KMS encryption for the data bucket
- SageMaker Pipeline defined directly in CloudFormation through `AWS::SageMaker::Pipeline`
- AWS CDK Pipelines for staged alpha, gamma, and prod deployments through AWS CodePipeline and AWS CodeBuild
- GitHub Actions workflow for pull-request validation only

## Prerequisites

- Node.js 22 or newer
- Docker running locally for CDK image asset builds
- AWS CLI configured with deployment credentials
- AWS CDK bootstrap completed in each target account and region
- A CodeStar Connections connection ARN for the source repository used by the CDK Pipeline
- The generated project pushed to a GitHub repository connected to AWS CodeConnections

## Quick Deploy

First complete the two manual setup steps:

1. Create a GitHub repository for this generated project and push the code.
2. Create and authorize an AWS CodeConnections/CodeStar Connections connection to that repository.

Then run these commands:

```bash
cd /Users/filippolentoni/Desktop/Learn_Brazil/output/ML_Training
```

```bash
npm install
```

```bash
AWS_PROFILE=columbia npx cdk bootstrap aws://169976659173/us-east-2
```

```bash
export SOURCE_REPO=github-owner/ml-training
export SOURCE_BRANCH=main
export CODESTAR_CONNECTION_ARN=arn:aws:codestar-connections:us-east-2:169976659173:connection/<connection-id>
```

```bash
AWS_PROFILE=columbia npm run deploy:pipeline -- --require-approval never
```

The CDK Pipeline deploys alpha, waits for approval before gamma, and waits for approval before prod.

Bootstrap example for another account or region:

```bash
npx cdk bootstrap aws://169976659173/us-east-1
```

## Stage Configuration

The app synthesizes four stages by default:

| Stage | Stack | Default account | Default region |
| --- | --- | --- | --- |
| personal | `BurnerModelTraining-PersonalStack` | `CDK_DEFAULT_ACCOUNT` or `169976659173` | `CDK_DEFAULT_REGION` or `us-east-1` |
| alpha | `BurnerModelTraining-AlphaStack` | `CDK_DEFAULT_ACCOUNT` or `169976659173` | `CDK_DEFAULT_REGION` or `us-east-1` |
| gamma | `BurnerModelTraining-GammaStack` | `CDK_DEFAULT_ACCOUNT` or `169976659173` | `CDK_DEFAULT_REGION` or `us-east-1` |
| prod | `BurnerModelTraining-ProdStack` | `CDK_DEFAULT_ACCOUNT` or `169976659173` | `CDK_DEFAULT_REGION` or `us-east-1` |

Override accounts and regions with environment variables:

```bash
export PERSONAL_ACCOUNT_ID=169976659173
export ALPHA_ACCOUNT_ID=169976659173
export GAMMA_ACCOUNT_ID=169976659173
export PROD_ACCOUNT_ID=169976659173
export ALPHA_REGION=us-east-1
```

Using one account for every stage is a simulation setup. For production, set distinct account IDs and let the CDK Pipeline promote alpha, gamma, and prod with approval gates before gamma and prod.

## Deployment Pipeline

The staged deployment orchestrator is defined in CDK as `MlTrainingPipelineStack`.

Configure the source repository and connection before deploying the pipeline stack:

```bash
export SOURCE_REPO=github-owner/ml-training
export SOURCE_BRANCH=main
export CODESTAR_CONNECTION_ARN=arn:aws:codestar-connections:us-east-1:169976659173:connection/<connection-id>
```

Deploy the AWS-native CDK Pipeline:

```bash
npm run deploy:pipeline -- --require-approval never
```

The pipeline runs `npm ci`, `npm test`, and `npm run synth`, then deploys:

1. alpha
2. gamma after manual approval
3. prod after manual approval

The direct stage deploy commands remain useful for personal smoke testing and development, but CDK Pipelines is the intended public mapping for multi-stage deployment orchestration.

## Commands

Install dependencies:

```bash
npm install
```

Build and run the lightweight validation:

```bash
npm test
```

Synthesize CloudFormation:

```bash
npm run synth
```

Deploy the personal stack:

```bash
npm run deploy:personal -- --require-approval never
```

Start the deployed SageMaker Pipeline with the sample CSV uploaded by CDK:

```bash
aws sagemaker start-pipeline-execution \
  --pipeline-name burner-model-training-personal \
  --pipeline-parameters Name=InputDataUri,Value=s3://<data-bucket-name>/input-data Name=MaxJobs,Value=2 Name=MaxParallelJobs,Value=1
```

The deployed stack outputs the exact start command.

## Input Data

The preprocessing code expects a CSV file named `data.csv` with these columns:

- `Survived`
- `Age`
- `SibSp`
- `Parch`
- `Fare`

The repository includes a small sample under `test-data/data.csv`. Replace it with a real dataset by uploading to the deployed bucket under `input-data/data.csv`, or pass another S3 URI as the `InputDataUri` pipeline parameter.

## Pipeline

The GitHub Actions workflow is validation-only and runs:

1. `npm ci`
2. `npm test`
3. `npm run synth`
Deployments are handled by the AWS CDK Pipeline in `MlTrainingPipelineStack`.

## Assumptions and Limits

- The public version uses a local Docker image asset instead of a private build artifact.
- The model behavior is preserved as a Random Forest classifier using the same feature columns, target column, split strategy, tuning objective, and evaluation metrics.
- The sample data is intentionally tiny and only validates the flow shape. Use a larger dataset for real training.
- The default SageMaker instance types and synthetic data are intentionally cost-safe for smoke testing. Adjust `lib/config.ts` and the input data for real training.
