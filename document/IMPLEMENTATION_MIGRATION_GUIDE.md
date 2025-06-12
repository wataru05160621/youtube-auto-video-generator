# YouTube動画自動生成システム - 実装・マイグレーションガイド

## 🎯 このガイドの目的

前回のデプロイ失敗を受けて、改善されたアーキテクチャに基づく段階的なマイグレーション計画を提供します。既存のデータを保護しながら、安定したシステムを構築します。

## 📋 移行前の準備

### 1. 現在の状態確認

```bash
# 現在のスタック状態を確認
aws cloudformation list-stacks \
  --query "StackSummaries[?contains(StackName,'VideoGenerator')].{Name:StackName,Status:StackStatus}" \
  --output table

# 現在のリソース一覧
aws cloudformation describe-stack-resources \
  --stack-name VideoGenerator-S3-dev \
  --query "StackResources[].{Type:ResourceType,LogicalId:LogicalResourceId,Status:ResourceStatus}"
```

### 2. データバックアップ

```bash
# S3 バケット内容のバックアップ
aws s3 sync s3://your-current-bucket s3://backup-bucket-$(date +%Y%m%d) --recursive

# Secrets Manager の設定確認
aws secretsmanager list-secrets \
  --query "SecretList[?contains(Name,'video-generator')].{Name:Name,LastChanged:LastChangedDate}"
```

### 3. 必要なツール・権限の確認

```bash
# CDK バージョン確認
cdk --version

# AWS CLI 設定確認
aws sts get-caller-identity

# Docker 動作確認
docker --version
docker run --rm hello-world
```

## 🏗️ 段階的実装計画

### Phase 1: Foundation Layer の構築

#### 1.1 新しいディレクトリ構造の作成

```bash
cd infrastructure
mkdir -p lib/{foundation,infrastructure,application}
mkdir -p bin/{foundation,infrastructure,application}
mkdir -p config
```

#### 1.2 設定ファイルの作成

**config/stage-config.ts**
```typescript
export interface StageConfig {
  stage: string;
  env: {
    account: string;
    region: string;
  };
  bucketConfig: {
    retentionDays: number;
    glacierTransitionDays: number;
  };
  lambdaConfig: {
    lightMemorySize: number;
    heavyMemorySize: number;
    timeout: number;
  };
}

export const stageConfigs: Record<string, StageConfig> = {
  dev: {
    stage: 'dev',
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT!,
      region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
    },
    bucketConfig: {
      retentionDays: 30,
      glacierTransitionDays: 7,
    },
    lambdaConfig: {
      lightMemorySize: 512,
      heavyMemorySize: 3008, // Container Image Lambda の最大値
      timeout: 900, // 15分
    },
  },
  prod: {
    stage: 'prod',
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT!,
      region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
    },
    bucketConfig: {
      retentionDays: 365,
      glacierTransitionDays: 30,
    },
    lambdaConfig: {
      lightMemorySize: 1024,
      heavyMemorySize: 3008,
      timeout: 900,
    },
  },
};
```

**config/resource-naming.ts**
```typescript
export class ResourceNaming {
  constructor(private stage: string) {}

  // スタック名
  s3Stack = () => `VideoGen-S3-${this.stage}`;
  iamStack = () => `VideoGen-IAM-${this.stage}`;
  secretsStack = () => `VideoGen-Secrets-${this.stage}`;
  layersStack = () => `VideoGen-Layers-${this.stage}`;
  snsStack = () => `VideoGen-SNS-${this.stage}`;
  eventsStack = () => `VideoGen-Events-${this.stage}`;
  lambdaLightStack = () => `VideoGen-LambdaLight-${this.stage}`;
  lambdaHeavyStack = () => `VideoGen-LambdaHeavy-${this.stage}`;
  stepFunctionsStack = () => `VideoGen-StepFunctions-${this.stage}`;

  // リソース名
  s3Bucket = (account: string) => `videogen-assets-${this.stage}-${account}`;
  lambdaLightRole = () => `VideoGen-LambdaLight-Role-${this.stage}`;
  lambdaHeavyRole = () => `VideoGen-LambdaHeavy-Role-${this.stage}`;
  stepFunctionsRole = () => `VideoGen-StepFunctions-Role-${this.stage}`;

  // Lambda 関数名
  readSpreadsheetFunction = () => `videogen-read-spreadsheet-${this.stage}`;
  generateScriptFunction = () => `videogen-generate-script-${this.stage}`;
  writeScriptFunction = () => `videogen-write-script-${this.stage}`;
  generateImageFunction = () => `videogen-generate-image-${this.stage}`;
  synthesizeSpeechFunction = () => `videogen-synthesize-speech-${this.stage}`;
  composeVideoFunction = () => `videogen-compose-video-${this.stage}`;
  uploadToYouTubeFunction = () => `videogen-upload-youtube-${this.stage}`;

  // エクスポート名 (重複を避けるため一意性を保証)
  s3BucketNameExport = () => `VideoGen-S3-BucketName-${this.stage}`;
  s3BucketArnExport = () => `VideoGen-S3-BucketArn-${this.stage}`;
  lambdaLightRoleExport = () => `VideoGen-IAM-LambdaLightRole-${this.stage}`;
  lambdaHeavyRoleExport = () => `VideoGen-IAM-LambdaHeavyRole-${this.stage}`;
  stepFunctionsRoleExport = () => `VideoGen-IAM-StepFunctionsRole-${this.stage}`;
  commonLayerExport = () => `VideoGen-Layers-Common-${this.stage}`;
  ffmpegLayerExport = () => `VideoGen-Layers-FFmpeg-${this.stage}`;
  googleApisLayerExport = () => `VideoGen-Layers-GoogleApis-${this.stage}`;
}
```

#### 1.3 Foundation スタックの実装

**lib/foundation/s3-stack.ts**
```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';
import { StageConfig } from '../../config/stage-config';

export interface S3StackProps extends cdk.StackProps {
  config: StageConfig;
}

export class S3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.config.stage);

    this.bucket = new s3.Bucket(this, 'VideoGenAssets', {
      bucketName: this.naming.s3Bucket(this.account),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false, // コスト最適化のため無効
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(props.config.bucketConfig.glacierTransitionDays),
            },
          ],
        },
        {
          id: 'DeleteOldObjects',
          enabled: true,
          expiration: cdk.Duration.days(props.config.bucketConfig.retentionDays),
        },
        {
          id: 'DeleteIncompleteMultipartUploads',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Name of the S3 bucket for video generation assets',
      exportName: this.naming.s3BucketNameExport(),
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'ARN of the S3 bucket for video generation assets',
      exportName: this.naming.s3BucketArnExport(),
    });
  }
}
```

**lib/foundation/iam-stack.ts**
```typescript
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';
import { StageConfig } from '../../config/stage-config';

export interface IAMStackProps extends cdk.StackProps {
  config: StageConfig;
  s3BucketArn: string;
}

export class IAMStack extends cdk.Stack {
  public readonly lambdaLightRole: iam.Role;
  public readonly lambdaHeavyRole: iam.Role;
  public readonly stepFunctionsRole: iam.Role;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: IAMStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.config.stage);

    // Lambda Light Role (軽量処理用)
    this.lambdaLightRole = new iam.Role(this, 'LambdaLightRole', {
      roleName: this.naming.lambdaLightRole(),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        LambdaLightPolicy: new iam.PolicyDocument({
          statements: [
            // S3 アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                props.s3BucketArn,
                `${props.s3BucketArn}/*`,
              ],
            }),
            // Secrets Manager アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
              ],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:videogen/*`,
              ],
            }),
            // Polly アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'polly:SynthesizeSpeech',
                'polly:DescribeVoices',
              ],
              resources: ['*'],
            }),
            // SNS 発行権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:videogen-*`,
              ],
            }),
          ],
        }),
      },
    });

    // Lambda Heavy Role (重い処理・Container Image用)
    this.lambdaHeavyRole = new iam.Role(this, 'LambdaHeavyRole', {
      roleName: this.naming.lambdaHeavyRole(),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        LambdaHeavyPolicy: new iam.PolicyDocument({
          statements: [
            // S3 フルアクセス（動画処理のため）
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
                's3:GetObjectVersion',
              ],
              resources: [
                props.s3BucketArn,
                `${props.s3BucketArn}/*`,
              ],
            }),
            // Secrets Manager アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
              ],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:videogen/*`,
              ],
            }),
            // SNS 通知権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:videogen-*`,
              ],
            }),
            // CloudWatch Logs 権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/videogen-*`,
              ],
            }),
          ],
        }),
      },
    });

    // Step Functions Role
    this.stepFunctionsRole = new iam.Role(this, 'StepFunctionsRole', {
      roleName: this.naming.stepFunctionsRole(),
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        StepFunctionsPolicy: new iam.PolicyDocument({
          statements: [
            // Lambda 実行権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'lambda:InvokeFunction',
              ],
              resources: [
                `arn:aws:lambda:${this.region}:${this.account}:function:videogen-*`,
              ],
            }),
            // SNS 発行権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:videogen-*`,
              ],
            }),
          ],
        }),
      },
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'LambdaLightRoleArn', {
      value: this.lambdaLightRole.roleArn,
      description: 'ARN of the Lambda Light execution role',
      exportName: this.naming.lambdaLightRoleExport(),
    });

    new cdk.CfnOutput(this, 'LambdaHeavyRoleArn', {
      value: this.lambdaHeavyRole.roleArn,
      description: 'ARN of the Lambda Heavy execution role',
      exportName: this.naming.lambdaHeavyRoleExport(),
    });

    new cdk.CfnOutput(this, 'StepFunctionsRoleArn', {
      value: this.stepFunctionsRole.roleArn,
      description: 'ARN of the Step Functions execution role',
      exportName: this.naming.stepFunctionsRoleExport(),
    });
  }
}
```

#### 1.4 Foundation デプロイスクリプト

**bin/foundation/deploy-foundation.ts**
```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3Stack } from '../../lib/foundation/s3-stack';
import { IAMStack } from '../../lib/foundation/iam-stack';
import { SecretsStack } from '../../lib/foundation/secrets-stack';
import { stageConfigs } from '../../config/stage-config';

const app = new cdk.App();

// ステージ設定
const stage = app.node.tryGetContext('stage') || 'dev';
const config = stageConfigs[stage];

if (!config) {
  throw new Error(`Invalid stage: ${stage}. Available stages: ${Object.keys(stageConfigs).join(', ')}`);
}

// Foundation Layer
const s3Stack = new S3Stack(app, `VideoGen-S3-${stage}`, {
  env: config.env,
  config,
});

const iamStack = new IAMStack(app, `VideoGen-IAM-${stage}`, {
  env: config.env,
  config,
  s3BucketArn: s3Stack.bucket.bucketArn,
});

const secretsStack = new SecretsStack(app, `VideoGen-Secrets-${stage}`, {
  env: config.env,
  config,
});

// 依存関係の設定
iamStack.addDependency(s3Stack);
secretsStack.addDependency(iamStack);
```

### Phase 2: Foundation Layer のデプロイ

```bash
# Foundation Layer のビルドとデプロイ
cd infrastructure
npm run build

# S3 Stack のデプロイ
cdk deploy VideoGen-S3-dev -f ./bin/foundation/deploy-foundation.ts --require-approval never

# IAM Stack のデプロイ
cdk deploy VideoGen-IAM-dev -f ./bin/foundation/deploy-foundation.ts --require-approval never

# Secrets Stack のデプロイ
cdk deploy VideoGen-Secrets-dev -f ./bin/foundation/deploy-foundation.ts --require-approval never
```

### Phase 3: データ移行

#### 3.1 S3 データの移行

```bash
# 既存バケットから新しいバケットへのデータ移行
OLD_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name VideoGenerator-S3-dev \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
  --output text)

NEW_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name VideoGen-S3-dev \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
  --output text)

echo "Migrating from $OLD_BUCKET to $NEW_BUCKET"

# データの同期
aws s3 sync s3://$OLD_BUCKET s3://$NEW_BUCKET --recursive

# 移行確認
aws s3 ls s3://$NEW_BUCKET --recursive --summarize
```

#### 3.2 Secrets の移行

```bash
# 既存のシークレット情報を新しい名前空間にコピー
aws secretsmanager get-secret-value \
  --secret-id video-generator/openai-api-key-dev \
  --query SecretString --output text | \
aws secretsmanager put-secret-value \
  --secret-id videogen/openai-dev \
  --secret-string file:///dev/stdin

# YouTube 認証情報の移行
aws secretsmanager get-secret-value \
  --secret-id video-generator/youtube-credentials-dev \
  --query SecretString --output text | \
aws secretsmanager put-secret-value \
  --secret-id videogen/youtube-dev \
  --secret-string file:///dev/stdin

# Google 認証情報の移行
aws secretsmanager get-secret-value \
  --secret-id video-generator/google-credentials-dev \
  --query SecretString --output text | \
aws secretsmanager put-secret-value \
  --secret-id videogen/google-dev \
  --secret-string file:///dev/stdin
```

### Phase 4: Infrastructure Layer の構築

#### 4.1 Layers Stack の実装

**lib/infrastructure/layers-stack.ts**
```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';
import { StageConfig } from '../../config/stage-config';
import * as path from 'path';

export interface LayersStackProps extends cdk.StackProps {
  config: StageConfig;
}

export class LayersStack extends cdk.Stack {
  public readonly commonLayer: lambda.LayerVersion;
  public readonly ffmpegLayer: lambda.LayerVersion;
  public readonly googleApisLayer: lambda.LayerVersion;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: LayersStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.config.stage);

    // Common Layer (共通ライブラリ)
    this.commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      layerVersionName: `videogen-common-${props.config.stage}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../layers/common')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'Common utilities and AWS SDK for VideoGen functions',
    });

    // FFmpeg Layer (ARM64 対応)
    this.ffmpegLayer = new lambda.LayerVersion(this, 'FFmpegLayer', {
      layerVersionName: `videogen-ffmpeg-${props.config.stage}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../layers/ffmpeg-arm64')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'FFmpeg binary for ARM64 Lambda functions',
    });

    // Google APIs Layer
    this.googleApisLayer = new lambda.LayerVersion(this, 'GoogleApisLayer', {
      layerVersionName: `videogen-google-apis-${props.config.stage}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../layers/google-apis')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'Google APIs client libraries',
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'CommonLayerArn', {
      value: this.commonLayer.layerVersionArn,
      description: 'ARN of the common layer',
      exportName: this.naming.commonLayerExport(),
    });

    new cdk.CfnOutput(this, 'FFmpegLayerArn', {
      value: this.ffmpegLayer.layerVersionArn,
      description: 'ARN of the FFmpeg layer',
      exportName: this.naming.ffmpegLayerExport(),
    });

    new cdk.CfnOutput(this, 'GoogleApisLayerArn', {
      value: this.googleApisLayer.layerVersionArn,
      description: 'ARN of the Google APIs layer',
      exportName: this.naming.googleApisLayerExport(),
    });
  }
}
```

### Phase 5: Application Layer の実装

続きは次のフェーズで詳細に説明します。Container Image Lambda の実装、Step Functions の統合、テストとデプロイの自動化などを含みます。

## 🔍 検証とテスト

### デプロイ後の検証

```bash
# Foundation Layer の確認
aws cloudformation describe-stacks --stack-name VideoGen-S3-dev --query "Stacks[0].StackStatus"
aws cloudformation describe-stacks --stack-name VideoGen-IAM-dev --query "Stacks[0].StackStatus"
aws cloudformation describe-stacks --stack-name VideoGen-Secrets-dev --query "Stacks[0].StackStatus"

# S3 バケットの確認
aws s3 ls | grep videogen

# IAM ロールの確認
aws iam list-roles --query "Roles[?contains(RoleName,'VideoGen')].RoleName"

# Secrets の確認
aws secretsmanager list-secrets --query "SecretList[?contains(Name,'videogen')].Name"
```

### ロールバック計画

```bash
# 問題が発生した場合のロールバック
cdk destroy VideoGen-Secrets-dev --force
cdk destroy VideoGen-IAM-dev --force
cdk destroy VideoGen-S3-dev --force

# データを元のバケットに戻す
aws s3 sync s3://$NEW_BUCKET s3://$OLD_BUCKET --recursive
```

---

**次のステップ**: Foundation Layer のデプロイ後、Infrastructure Layer と Application Layer の実装を進めます。
