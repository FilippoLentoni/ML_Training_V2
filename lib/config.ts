export interface StageConfig {
  readonly name: 'personal' | 'alpha' | 'gamma' | 'prod';
  readonly stackSuffix: 'Personal' | 'Alpha' | 'Gamma' | 'Prod';
  readonly account: string;
  readonly region: string;
  readonly removalPolicy: 'destroy' | 'retain';
}

const defaultAccount = process.env.CDK_DEFAULT_ACCOUNT ?? '169976659173';
const defaultRegion = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

export const STAGES: StageConfig[] = [
  {
    name: 'personal',
    stackSuffix: 'Personal',
    account: process.env.PERSONAL_ACCOUNT_ID ?? defaultAccount,
    region: process.env.PERSONAL_REGION ?? defaultRegion,
    removalPolicy: 'destroy',
  },
  {
    name: 'alpha',
    stackSuffix: 'Alpha',
    account: process.env.ALPHA_ACCOUNT_ID ?? defaultAccount,
    region: process.env.ALPHA_REGION ?? defaultRegion,
    removalPolicy: 'retain',
  },
  {
    name: 'gamma',
    stackSuffix: 'Gamma',
    account: process.env.GAMMA_ACCOUNT_ID ?? defaultAccount,
    region: process.env.GAMMA_REGION ?? defaultRegion,
    removalPolicy: 'retain',
  },
  {
    name: 'prod',
    stackSuffix: 'Prod',
    account: process.env.PROD_ACCOUNT_ID ?? defaultAccount,
    region: process.env.PROD_REGION ?? defaultRegion,
    removalPolicy: 'retain',
  },
];

export const MODEL_FEATURES = ['Age', 'SibSp', 'Parch', 'Fare'];
export const MODEL_TARGET = 'Survived';

export const TRAINING_DEFAULTS = {
  preprocessingInstanceType: 'ml.t3.medium',
  preprocessingVolumeSizeGb: 30,
  tuningInstanceType: 'ml.m5.large',
  tuningVolumeSizeGb: 30,
  trainingInstanceType: 'ml.m5.large',
  trainingVolumeSizeGb: 30,
  evaluationInstanceType: 'ml.t3.medium',
  evaluationVolumeSizeGb: 30,
  maxJobs: 1,
  maxParallelJobs: 1,
};
