import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';

export interface LayersStackProps extends cdk.StackProps {
  stage: string;
}

export class LayersStack extends cdk.Stack {
  public readonly commonLayer: lambda.LayerVersion;
  public readonly ffmpegLayer: lambda.LayerVersion;
  public readonly googleApisLayer: lambda.LayerVersion;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: LayersStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Common utilities layer
    this.commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      layerVersionName: `${this.naming.lambdaFunctionName('common-layer')}`,
      code: lambda.Code.fromAsset('../layers/common'),
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_20_X,
        lambda.Runtime.NODEJS_18_X,
      ],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'Common utilities and shared libraries for video generation',
    });

    // FFmpeg layer for video processing
    this.ffmpegLayer = new lambda.LayerVersion(this, 'FFmpegLayer', {
      layerVersionName: `${this.naming.lambdaFunctionName('ffmpeg-layer')}`,
      code: lambda.Code.fromAsset('../layers/ffmpeg'),
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_20_X,
        lambda.Runtime.NODEJS_18_X,
      ],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'FFmpeg binary and related tools for video processing',
    });

    // Google APIs layer
    this.googleApisLayer = new lambda.LayerVersion(this, 'GoogleApisLayer', {
      layerVersionName: `${this.naming.lambdaFunctionName('google-apis-layer')}`,
      code: lambda.Code.fromAsset('../layers/google-apis'),
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_20_X,
        lambda.Runtime.NODEJS_18_X,
      ],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'Google APIs client libraries for Spreadsheet and YouTube',
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, 'CommonLayerArn', {
      value: this.commonLayer.layerVersionArn,
      exportName: this.naming.exportName('Layers', 'CommonLayerArn'),
      description: 'ARN of the common utilities layer',
    });

    new cdk.CfnOutput(this, 'FFmpegLayerArn', {
      value: this.ffmpegLayer.layerVersionArn,
      exportName: this.naming.exportName('Layers', 'FFmpegLayerArn'),
      description: 'ARN of the FFmpeg layer',
    });

    new cdk.CfnOutput(this, 'GoogleApisLayerArn', {
      value: this.googleApisLayer.layerVersionArn,
      exportName: this.naming.exportName('Layers', 'GoogleApisLayerArn'),
      description: 'ARN of the Google APIs layer',
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'YouTube-Auto-Video-Generator');
    cdk.Tags.of(this).add('Stage', props.stage);
    cdk.Tags.of(this).add('Layer', 'Infrastructure');
  }
}
