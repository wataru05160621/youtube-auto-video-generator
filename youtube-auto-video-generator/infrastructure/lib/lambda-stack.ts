import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';
import { LambdaLayersStack } from './lambda-layers-stack';

export interface LambdaStackProps extends cdk.StackProps {
  stage: string;
  s3Bucket: s3.Bucket;
  layersStack: LambdaLayersStack;
}

export interface LambdaFunctions {
  readSpreadsheetFunction: lambda.Function;
  generateScriptFunction: lambda.Function;
  writeScriptFunction: lambda.Function;
  generateImageFunction: lambda.Function;
  synthesizeSpeechFunction: lambda.Function;
  uploadToYouTubeFunction: lambda.Function;
}

export class LambdaStack extends cdk.Stack {
  public readonly functions: LambdaFunctions;
  public readonly lambdaExecutionRole: iam.Role;
  public readonly stepFunctionsExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Lambda実行ロールを作成
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `VideoGenerator-Lambda-Role-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        LambdaCustomPolicy: new iam.PolicyDocument({
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
                `arn:aws:sns:${this.region}:${this.account}:video-generator-notifications-${props.stage}`,
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

    // Step Functions 実行ロール
    this.stepFunctionsExecutionRole = new iam.Role(this, 'StepFunctionsExecutionRole', {
      roleName: `VideoGenerator-StepFunctions-Role-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        StepFunctionsCustomPolicy: new iam.PolicyDocument({
          statements: [
            // Lambda 実行権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'lambda:InvokeFunction',
              ],
              resources: [
                `arn:aws:lambda:${this.region}:${this.account}:function:video-generator-*-${props.stage}`,
              ],
            }),
            // SNS 発行権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:video-generator-notifications-${props.stage}`,
              ],
            }),
            // CloudWatch Logs 権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/stepfunctions/video-generator-*`,
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

    // 1. ReadSpreadsheetFunction
    this.functions = {
      readSpreadsheetFunction: new lambda.Function(this, 'ReadSpreadsheetFunction', {
        functionName: `video-generator-read-spreadsheet-${props.stage}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'dist/index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../src/ReadSpreadsheetFunction')),
        role: this.lambdaExecutionRole,
        timeout: cdk.Duration.minutes(5),
        memorySize: 256,
        layers: [props.layersStack.commonLayer],
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'ReadSpreadsheetFunction',
        },
      }),

      // 2. GenerateScriptFunction
      generateScriptFunction: new lambda.Function(this, 'GenerateScriptFunction', {
        functionName: `video-generator-generate-script-${props.stage}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'dist/index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../src/GenerateScriptFunction')),
        role: this.lambdaExecutionRole,
        timeout: cdk.Duration.minutes(10),
        memorySize: 512,
        layers: [props.layersStack.commonLayer],
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'GenerateScriptFunction',
        },
      }),

      // 3. WriteScriptFunction
      writeScriptFunction: new lambda.Function(this, 'WriteScriptFunction', {
        functionName: `video-generator-write-script-${props.stage}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'dist/index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../src/WriteScriptFunction')),
        role: this.lambdaExecutionRole,
        timeout: cdk.Duration.minutes(5),
        memorySize: 256,
        layers: [props.layersStack.commonLayer],
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'WriteScriptFunction',
        },
      }),

      // 4. GenerateImageFunction
      generateImageFunction: new lambda.Function(this, 'GenerateImageFunction', {
        functionName: `video-generator-generate-image-${props.stage}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'dist/index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../src/GenerateImageFunction')),
        role: this.lambdaExecutionRole,
        timeout: cdk.Duration.minutes(10),
        memorySize: 1024,
        layers: [props.layersStack.commonLayer],
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'GenerateImageFunction',
        },
      }),

      // 5. SynthesizeSpeechFunction
      synthesizeSpeechFunction: new lambda.Function(this, 'SynthesizeSpeechFunction', {
        functionName: `video-generator-synthesize-speech-${props.stage}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'dist/index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../src/SynthesizeSpeechFunction')),
        role: this.lambdaExecutionRole,
        timeout: cdk.Duration.minutes(10),
        memorySize: 512,
        layers: [props.layersStack.commonLayer],
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'SynthesizeSpeechFunction',
        },
      }),

      // 6. UploadToYouTubeFunction
      uploadToYouTubeFunction: new lambda.Function(this, 'UploadToYouTubeFunction', {
        functionName: `video-generator-upload-youtube-${props.stage}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'dist/index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../src/UploadToYouTubeFunction')),
        role: this.lambdaExecutionRole,
        timeout: cdk.Duration.minutes(15),
        memorySize: 512,
        layers: [props.layersStack.commonLayer],
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'UploadToYouTubeFunction',
        },
      }),
    };

    // CloudWatch ログ保持期間設定
    Object.values(this.functions).forEach((func, index) => {
      const functionNames = [
        'ReadSpreadsheet',
        'GenerateScript', 
        'WriteScript',
        'GenerateImage',
        'SynthesizeSpeech',
        'UploadToYouTube'
      ];
      
      new cdk.CfnOutput(this, `${functionNames[index]}FunctionArn`, {
        value: func.functionArn,
        description: `ARN of the ${functionNames[index]} Lambda function`,
        exportName: `VideoGenerator-${functionNames[index]}-Function-Arn-${props.stage}`,
      });
    });
  }
}
