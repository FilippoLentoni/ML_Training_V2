import * as path from 'path';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_ecr_assets as ecrAssets,
  aws_iam as iam,
  aws_kms as kms,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_sagemaker as sagemaker,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StageConfig, TRAINING_DEFAULTS } from './config';

export interface BurnerModelTrainingStackProps extends StackProps {
  readonly stage: StageConfig;
}

export class BurnerModelTrainingStack extends Stack {
  constructor(scope: Construct, id: string, props: BurnerModelTrainingStackProps) {
    super(scope, id, props);

    const removalPolicy =
      props.stage.removalPolicy === 'destroy' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN;

    const dataKey = new kms.Key(this, 'DataKey', {
      enableKeyRotation: true,
      removalPolicy,
    });

    const logsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: props.stage.removalPolicy === 'destroy',
      lifecycleRules: [{ expiration: Duration.days(3650) }],
    });

    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: dataKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      serverAccessLogsBucket: logsBucket,
      removalPolicy,
      autoDeleteObjects: props.stage.removalPolicy === 'destroy',
      lifecycleRules: [{ expiration: Duration.days(3650) }],
    });

    const sampleDataDeployment = new s3deploy.BucketDeployment(this, 'SampleDataDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', 'test-data'))],
      destinationBucket: dataBucket,
      destinationKeyPrefix: 'input-data',
      retainOnDelete: props.stage.removalPolicy !== 'destroy',
    });

    const trainingImage = new ecrAssets.DockerImageAsset(this, 'TrainingImage', {
      directory: path.join(__dirname, '..'),
      file: 'Dockerfile',
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    const executionRole = new iam.Role(this, 'SageMakerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description: 'Execution role for the public SageMaker training pipeline.',
    });

    dataBucket.grantReadWrite(executionRole);
    dataKey.grantEncryptDecrypt(executionRole);
    trainingImage.repository.grantPull(executionRole);
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'sagemaker:AddTags',
          'sagemaker:CreateHyperParameterTuningJob',
          'sagemaker:CreateProcessingJob',
          'sagemaker:CreateTrainingJob',
          'sagemaker:DescribeHyperParameterTuningJob',
          'sagemaker:DescribeProcessingJob',
          'sagemaker:DescribeTrainingJob',
          'sagemaker:ListTrainingJobsForHyperParameterTuningJob',
          'sagemaker:StopHyperParameterTuningJob',
          'sagemaker:StopProcessingJob',
          'sagemaker:StopTrainingJob',
          'cloudwatch:PutMetricData',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      }),
    );
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [executionRole.roleArn],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'sagemaker.amazonaws.com',
          },
        },
      }),
    );

    const pipelineName = `burner-model-training-${props.stage.name}`;
    const pipelineDefinition = this.buildPipelineDefinition({
      pipelineName,
      bucketName: dataBucket.bucketName,
      imageUri: trainingImage.imageUri,
      roleArn: executionRole.roleArn,
    });

    const pipeline = new sagemaker.CfnPipeline(this, 'SageMakerPipeline', {
      pipelineName,
      roleArn: executionRole.roleArn,
      pipelineDefinition: {
        PipelineDefinitionBody: this.toJsonString(pipelineDefinition),
      },
    });
    pipeline.node.addDependency(sampleDataDeployment);

    new CfnOutput(this, 'DataBucketName', { value: dataBucket.bucketName });
    new CfnOutput(this, 'TrainingImageUri', { value: trainingImage.imageUri });
    new CfnOutput(this, 'PipelineName', { value: pipeline.pipelineName! });
    new CfnOutput(this, 'ExecutionRoleArn', { value: executionRole.roleArn });
    new CfnOutput(this, 'StartPipelineCommand', {
      value: [
        'aws sagemaker start-pipeline-execution',
        `--pipeline-name ${pipelineName}`,
        `--pipeline-parameters Name=InputDataUri,Value=s3://${dataBucket.bucketName}/input-data`,
        `Name=MaxJobs,Value=${TRAINING_DEFAULTS.maxJobs}`,
        `Name=MaxParallelJobs,Value=${TRAINING_DEFAULTS.maxParallelJobs}`,
      ].join(' '),
    });
  }

  private buildPipelineDefinition(input: {
    readonly pipelineName: string;
    readonly bucketName: string;
    readonly imageUri: string;
    readonly roleArn: string;
  }) {
    const outputBase = {
      'Std:Join': {
        On: '/',
        Values: ['s3:/', input.bucketName, 'pipelines', input.pipelineName, { Get: 'Execution.PipelineExecutionId' }],
      },
    };
    const processedDataUri = {
      Get: "Steps.preprocessing.ProcessingOutputConfig.Outputs['processed_data'].S3Output.S3Uri",
    };
    const joinProcessed = (suffix: string) => ({
      'Std:Join': {
        On: '/',
        Values: [processedDataUri, suffix],
      },
    });
    const stepOutput = (stepName: string, suffix: string) => ({
      'Std:Join': {
        On: '/',
        Values: [outputBase, stepName, suffix],
      },
    });

    return {
      Version: '2020-12-01',
      Metadata: {},
      Parameters: [
        { Name: 'InputDataUri', Type: 'String' },
        { Name: 'MaxJobs', Type: 'Integer', DefaultValue: TRAINING_DEFAULTS.maxJobs },
        { Name: 'MaxParallelJobs', Type: 'Integer', DefaultValue: TRAINING_DEFAULTS.maxParallelJobs },
      ],
      PipelineExperimentConfig: {
        ExperimentName: { Get: 'Execution.PipelineName' },
        TrialName: { Get: 'Execution.PipelineExecutionId' },
      },
      Steps: [
        {
          Name: 'preprocessing',
          Type: 'Processing',
          Arguments: {
            ProcessingResources: {
              ClusterConfig: {
                InstanceType: TRAINING_DEFAULTS.preprocessingInstanceType,
                InstanceCount: 1,
                VolumeSizeInGB: TRAINING_DEFAULTS.preprocessingVolumeSizeGb,
              },
            },
            AppSpecification: {
              ImageUri: input.imageUri,
              ContainerEntrypoint: ['python', 'processing.py'],
              ContainerArguments: ['--processing-type', 'preprocessing'],
            },
            RoleArn: input.roleArn,
            ProcessingInputs: [
              {
                InputName: 'input_data',
                AppManaged: false,
                S3Input: {
                  S3Uri: { Get: 'Parameters.InputDataUri' },
                  LocalPath: '/opt/ml/processing/input/',
                  S3DataType: 'S3Prefix',
                  S3InputMode: 'File',
                  S3DataDistributionType: 'FullyReplicated',
                  S3CompressionType: 'None',
                },
              },
            ],
            ProcessingOutputConfig: {
              Outputs: [
                {
                  OutputName: 'processed_data',
                  AppManaged: false,
                  S3Output: {
                    S3Uri: stepOutput('preprocessing', 'processed_data'),
                    LocalPath: '/opt/ml/processing/output/',
                    S3UploadMode: 'EndOfJob',
                  },
                },
              ],
            },
          },
          CacheConfig: { Enabled: false },
        },
        {
          Name: 'tuning',
          Type: 'Tuning',
          Arguments: {
            HyperParameterTuningJobConfig: {
              Strategy: 'Bayesian',
              ResourceLimits: {
                MaxNumberOfTrainingJobs: { Get: 'Parameters.MaxJobs' },
                MaxParallelTrainingJobs: { Get: 'Parameters.MaxParallelJobs' },
              },
              TrainingJobEarlyStoppingType: 'Off',
              HyperParameterTuningJobObjective: {
                Type: 'Maximize',
                MetricName: 'roc_auc',
              },
              ParameterRanges: {
                ContinuousParameterRanges: [],
                CategoricalParameterRanges: [],
                IntegerParameterRanges: [
                  {
                    Name: 'num_estimators',
                    MinValue: '10',
                    MaxValue: '100',
                    ScalingType: 'Logarithmic',
                  },
                ],
              },
            },
            TrainingJobDefinition: {
              StaticHyperParameters: {},
              RoleArn: input.roleArn,
              OutputDataConfig: {
                S3OutputPath: stepOutput('tuning', 'fitted_artifacts'),
              },
              StoppingCondition: { MaxRuntimeInSeconds: 86400 },
              HyperParameterTuningResourceConfig: {
                InstanceCount: 1,
                InstanceType: TRAINING_DEFAULTS.tuningInstanceType,
                VolumeSizeInGB: TRAINING_DEFAULTS.tuningVolumeSizeGb,
              },
              AlgorithmSpecification: {
                TrainingInputMode: 'File',
                MetricDefinitions: [
                  {
                    Name: 'roc_auc',
                    Regex: 'Validation ROC AUC: ([0-9\\.]+)',
                  },
                ],
                TrainingImage: input.imageUri,
              },
              InputDataConfig: [
                {
                  ChannelName: 'train',
                  DataSource: {
                    S3DataSource: {
                      S3DataType: 'S3Prefix',
                      S3Uri: joinProcessed('train'),
                      S3DataDistributionType: 'FullyReplicated',
                    },
                  },
                },
                {
                  ChannelName: 'validation',
                  DataSource: {
                    S3DataSource: {
                      S3DataType: 'S3Prefix',
                      S3Uri: joinProcessed('validation'),
                      S3DataDistributionType: 'FullyReplicated',
                    },
                  },
                },
              ],
            },
          },
          CacheConfig: { Enabled: false },
        },
        {
          Name: 'training',
          Type: 'Training',
          Arguments: {
            AlgorithmSpecification: {
              TrainingInputMode: 'File',
              TrainingImage: input.imageUri,
            },
            OutputDataConfig: {
              S3OutputPath: stepOutput('training', 'fitted_artifacts'),
            },
            StoppingCondition: { MaxRuntimeInSeconds: 86400 },
            ResourceConfig: {
              VolumeSizeInGB: TRAINING_DEFAULTS.trainingVolumeSizeGb,
              InstanceCount: 1,
              InstanceType: TRAINING_DEFAULTS.trainingInstanceType,
            },
            RoleArn: input.roleArn,
            InputDataConfig: [
              {
                ChannelName: 'train',
                DataSource: {
                  S3DataSource: {
                    S3DataType: 'S3Prefix',
                    S3Uri: joinProcessed('total'),
                    S3DataDistributionType: 'FullyReplicated',
                  },
                },
              },
            ],
            HyperParameters: {
              num_estimators: {
                'Std:Join': {
                  On: '',
                  Values: [{ Get: "Steps.tuning.BestTrainingJob.TunedHyperParameters['num_estimators']" }],
                },
              },
            },
          },
          CacheConfig: { Enabled: false },
        },
        {
          Name: 'evaluation',
          Type: 'Processing',
          Arguments: {
            ProcessingResources: {
              ClusterConfig: {
                InstanceType: TRAINING_DEFAULTS.evaluationInstanceType,
                InstanceCount: 1,
                VolumeSizeInGB: TRAINING_DEFAULTS.evaluationVolumeSizeGb,
              },
            },
            AppSpecification: {
              ImageUri: input.imageUri,
              ContainerEntrypoint: ['python', 'processing.py'],
              ContainerArguments: ['--processing-type', 'evaluation'],
            },
            RoleArn: input.roleArn,
            ProcessingInputs: [
              {
                InputName: 'test',
                AppManaged: false,
                S3Input: {
                  S3Uri: joinProcessed('test'),
                  LocalPath: '/opt/ml/processing/input/test/',
                  S3DataType: 'S3Prefix',
                  S3InputMode: 'File',
                  S3DataDistributionType: 'FullyReplicated',
                  S3CompressionType: 'None',
                },
              },
              {
                InputName: 'model',
                AppManaged: false,
                S3Input: {
                  S3Uri: { Get: 'Steps.training.ModelArtifacts.S3ModelArtifacts' },
                  LocalPath: '/opt/ml/processing/input/model/',
                  S3DataType: 'S3Prefix',
                  S3InputMode: 'File',
                  S3DataDistributionType: 'FullyReplicated',
                  S3CompressionType: 'None',
                },
              },
            ],
          },
          CacheConfig: { Enabled: false },
        },
      ],
    };
  }
}
