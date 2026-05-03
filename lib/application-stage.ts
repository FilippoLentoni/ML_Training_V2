import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StageConfig } from './config';
import { BurnerModelTrainingStack } from './ml-pipeline-stack';

export interface BurnerModelTrainingApplicationStageProps extends StageProps {
  readonly stageConfig: StageConfig;
}

export class BurnerModelTrainingApplicationStage extends Stage {
  constructor(scope: Construct, id: string, props: BurnerModelTrainingApplicationStageProps) {
    super(scope, id, props);

    new BurnerModelTrainingStack(this, 'Application', {
      env: {
        account: props.stageConfig.account,
        region: props.stageConfig.region,
      },
      stackName: `BurnerModelTraining-${props.stageConfig.stackSuffix}Stack`,
      stage: props.stageConfig,
    });
  }
}
