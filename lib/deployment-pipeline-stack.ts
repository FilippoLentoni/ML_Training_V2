import { Stack, StackProps, aws_codepipeline as codepipeline, pipelines } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BurnerModelTrainingApplicationStage } from './application-stage';
import { STAGES } from './config';

const sourceRepo = process.env.SOURCE_REPO ?? 'replace-with-github-owner/ml-training';
const sourceBranch = process.env.SOURCE_BRANCH ?? 'main';
const sourceConnectionArn =
  process.env.CODESTAR_CONNECTION_ARN ??
  'arn:aws:codestar-connections:us-east-1:169976659173:connection/00000000-0000-0000-0000-000000000000';

export class DeploymentPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      pipelineName: 'MlTrainingDeploymentPipeline',
      pipelineType: codepipeline.PipelineType.V2,
      crossAccountKeys: true,
      dockerEnabledForSelfMutation: true,
      dockerEnabledForSynth: true,
      synth: new pipelines.ShellStep('Synth', {
        input: pipelines.CodePipelineSource.connection(sourceRepo, sourceBranch, {
          connectionArn: sourceConnectionArn,
        }),
        env: {
          SOURCE_REPO: sourceRepo,
          SOURCE_BRANCH: sourceBranch,
          CODESTAR_CONNECTION_ARN: sourceConnectionArn,
          CDK_DEFAULT_ACCOUNT: Stack.of(this).account,
          CDK_DEFAULT_REGION: Stack.of(this).region,
        },
        commands: ['npm ci', 'npm test', 'npm run synth'],
      }),
    });

    for (const stageConfig of STAGES.filter((stage) => stage.name !== 'personal')) {
      const appStage = new BurnerModelTrainingApplicationStage(this, stageConfig.stackSuffix, {
        env: {
          account: stageConfig.account,
          region: stageConfig.region,
        },
        stageConfig,
      });

      const requiresApproval = stageConfig.name === 'gamma' || stageConfig.name === 'prod';
      pipeline.addStage(appStage, {
        pre: requiresApproval
          ? [new pipelines.ManualApprovalStep(`Approve-${stageConfig.stackSuffix}`)]
          : undefined,
      });
    }
  }
}
