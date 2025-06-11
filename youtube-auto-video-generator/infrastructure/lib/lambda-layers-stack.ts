import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaLayersStackProps extends cdk.StackProps {
  stage: string;
}

export class LambdaLayersStack extends cdk.Stack {
  public readonly commonLayer: lambda.LayerVersion;
  public readonly googleApisLayer: lambda.LayerVersion;
  // public readonly ffmpegLayer: lambda.LayerVersion; // 一時的にコメントアウト

  constructor(scope: Construct, id: string, props: LambdaLayersStackProps) {
    super(scope, id, props);

    // Common dependencies layer (AWS SDK, basic utilities)
    this.commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      layerVersionName: `video-generator-common-${props.stage}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/common')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Common dependencies for video generator functions',
    });

    // Google APIs layer (YouTube, Google Sheets, etc.)
    this.googleApisLayer = new lambda.LayerVersion(this, 'GoogleApisLayer', {
      layerVersionName: `video-generator-google-apis-${props.stage}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/google-apis')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Google APIs and authentication libraries',
    });

    // FFmpeg layer for video processing - 一時的にコメントアウト
    /*
    this.ffmpegLayer = new lambda.LayerVersion(this, 'FFmpegLayer', {
      layerVersionName: `video-generator-ffmpeg-${props.stage}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/ffmpeg')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'FFmpeg binaries for video processing',
    });
    */

    // Output layer ARNs for use in other stacks
    new cdk.CfnOutput(this, 'CommonLayerArn', {
      value: this.commonLayer.layerVersionArn,
      exportName: `VideoGenerator-CommonLayer-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'GoogleApisLayerArn', {
      value: this.googleApisLayer.layerVersionArn,
      exportName: `VideoGenerator-GoogleApisLayer-${props.stage}`,
    });

    /*
    new cdk.CfnOutput(this, 'FFmpegLayerArn', {
      value: this.ffmpegLayer.layerVersionArn,
      exportName: `VideoGenerator-FFmpegLayer-${props.stage}`,
    });
    */
  }
}
