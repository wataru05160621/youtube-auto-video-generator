import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';
import { LambdaLayersStack } from './lambda-layers-stack';

export interface LambdaHeavyStackProps extends cdk.StackProps {
  stage: string;
  s3Bucket: s3.Bucket;
  layersStack: LambdaLayersStack;
}

export interface HeavyLambdaFunctions {
  composeVideoFunction: lambda.DockerImageFunction;
}

export class LambdaHeavyStack extends cdk.Stack {
  public readonly functions: HeavyLambdaFunctions;
  public readonly lambdaExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: LambdaHeavyStackProps) {
    super(scope, id, props);

    // Lambda実行ロールを作成（LambdaHeavy専用）
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaHeavyExecutionRole', {
      roleName: `VideoGenerator-LambdaHeavy-Role-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        LambdaHeavyCustomPolicy: new iam.PolicyDocument({
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
                props.s3Bucket.bucketArn,
                `${props.s3Bucket.bucketArn}/*`,
              ],
            }),
            // Secrets Manager アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
              ],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:video-generator/*`,
              ],
            }),
            // SNS 通知権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:video-generator-*`,
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
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/video-generator-*`,
              ],
            }),
          ],
        }),
      },
    });

    // 共通の環境変数
    const commonEnvironment = {
      STAGE: props.stage,
      S3_BUCKET_NAME: props.s3Bucket.bucketName,
      OPENAI_API_KEY_SECRET_NAME: `video-generator/openai-api-key-${props.stage}`,
      GOOGLE_CREDENTIALS_SECRET_NAME: `video-generator/google-credentials-${props.stage}`,
      YOUTUBE_CREDENTIALS_SECRET_NAME: `video-generator/youtube-credentials-${props.stage}`,
    };

    // ComposeVideoFunction（Container Image Lambdaとして実装）
    this.functions = {
      composeVideoFunction: new lambda.DockerImageFunction(this, 'ComposeVideoFunction', {
        functionName: `video-generator-compose-video-${props.stage}`,
        code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../src/ComposeVideoFunction')),
        role: this.lambdaExecutionRole,
        timeout: cdk.Duration.minutes(15),
        memorySize: 3072, // Container Imageでは大きなメモリサイズを使用可能
        architecture: lambda.Architecture.X86_64,
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'ComposeVideoFunction',
          FFMPEG_PATH: '/usr/local/bin/ffmpeg', // Container内のffmpeg
          FFPROBE_PATH: '/usr/local/bin/ffprobe', // Container内のffprobe
        },
      }),
    };

    // CloudWatch ログ保持期間設定
    new cdk.CfnOutput(this, 'ComposeVideoFunctionArn', {
      value: this.functions.composeVideoFunction.functionArn,
      description: 'ARN of the ComposeVideo Lambda function',
      exportName: `VideoGenerator-ComposeVideo-Function-Arn-${props.stage}`,
    });
  }
}
