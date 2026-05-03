#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { STAGES } from '../lib/config';
import { DeploymentPipelineStack } from '../lib/deployment-pipeline-stack';
import { BurnerModelTrainingStack } from '../lib/ml-pipeline-stack';

const app = new cdk.App();

new DeploymentPipelineStack(app, 'MlTrainingPipelineStack', {
  env: {
    account: process.env.PIPELINE_ACCOUNT_ID ?? process.env.CDK_DEFAULT_ACCOUNT ?? '169976659173',
    region: process.env.PIPELINE_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});

for (const stage of STAGES) {
  new BurnerModelTrainingStack(app, `BurnerModelTraining-${stage.stackSuffix}Stack`, {
    env: {
      account: stage.account,
      region: stage.region,
    },
    stage,
  });
}

app.synth();
