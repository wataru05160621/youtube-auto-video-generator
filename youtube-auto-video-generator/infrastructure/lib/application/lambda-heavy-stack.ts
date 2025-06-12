import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';

export interface LambdaHeavyStackProps extends cdk.StackProps {
  stage: string;
}

export class LambdaHeavyStack extends cdk.Stack {
  public readonly composeVideoFunction: lambda.Function;
  public readonly uploadToYouTubeFunction: lambda.Function;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: LambdaHeavyStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Import cross-stack resources
    const lambdaHeavyRoleArn = cdk.Fn.importValue(
      this.naming.exportName('IAM', 'LambdaHeavyRoleArn')
    );
    const lambdaHeavyRole = iam.Role.fromRoleArn(
      this,
      'ImportedLambdaHeavyRole',
      lambdaHeavyRoleArn
    );

    const commonLayerArn = cdk.Fn.importValue(
      this.naming.exportName('Layers', 'CommonLayerArn')
    );
    const commonLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'ImportedCommonLayer',
      commonLayerArn
    );

    const ffmpegLayerArn = cdk.Fn.importValue(
      this.naming.exportName('Layers', 'FFmpegLayerArn')
    );
    const ffmpegLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'ImportedFFmpegLayer',
      ffmpegLayerArn
    );

    const googleApisLayerArn = cdk.Fn.importValue(
      this.naming.exportName('Layers', 'GoogleApisLayerArn')
    );
    const googleApisLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'ImportedGoogleApisLayer',
      googleApisLayerArn
    );

    // Common configuration for Container Image Lambda functions
    const commonHeavyLambdaProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(15), // Maximum timeout for heavy processing
      memorySize: 3008, // Maximum memory for Container Image Lambda
      role: lambdaHeavyRole,
      environment: {
        STAGE: props.stage,
      },
    };

    // 1. ComposeVideoFunction - FFmpeg を使用した動画合成
    // Note: This will be Container Image Lambda for FFmpeg support
    this.composeVideoFunction = new lambda.Function(this, 'ComposeVideoFunction', {
      ...commonHeavyLambdaProps,
      functionName: this.naming.lambdaFunctionName('ComposeVideo'),
      // For now, use zip deployment. Will be replaced with Container Image when ready
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('../src/lambda-heavy/ComposeVideoFunction'),
      handler: 'index.handler',
      layers: [commonLayer, ffmpegLayer],
      description: 'Compose video using FFmpeg (Container Image Lambda)',
      environment: {
        ...commonHeavyLambdaProps.environment,
        FFMPEG_PATH: '/opt/bin/ffmpeg', // Layer path
      },
    });

    // 2. UploadToYouTubeFunction - YouTube API で動画アップロード
    // Note: This will be Container Image Lambda for reliable YouTube upload
    this.uploadToYouTubeFunction = new lambda.Function(this, 'UploadToYouTubeFunction', {
      ...commonHeavyLambdaProps,
      functionName: this.naming.lambdaFunctionName('UploadToYouTube'),
      // For now, use zip deployment. Will be replaced with Container Image when ready
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('../src/lambda-heavy/UploadToYouTubeFunction'),
      handler: 'index.handler',
      layers: [commonLayer, googleApisLayer],
      description: 'Upload video to YouTube (Container Image Lambda)',
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, 'ComposeVideoFunctionArn', {
      value: this.composeVideoFunction.functionArn,
      exportName: this.naming.exportName('LambdaHeavy', 'ComposeVideoFunctionArn'),
      description: 'ARN of the ComposeVideo function',
    });

    new cdk.CfnOutput(this, 'UploadToYouTubeFunctionArn', {
      value: this.uploadToYouTubeFunction.functionArn,
      exportName: this.naming.exportName('LambdaHeavy', 'UploadToYouTubeFunctionArn'),
      description: 'ARN of the UploadToYouTube function',
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'YouTube-Auto-Video-Generator');
    cdk.Tags.of(this).add('Stage', props.stage);
    cdk.Tags.of(this).add('Layer', 'Application');
  }
}
