import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface S3StackProps extends cdk.StackProps {
  stage: string;
}

export class S3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props);

    // メインのストレージバケット
    this.bucket = new s3.Bucket(this, 'VideoGeneratorBucket', {
      bucketName: `video-generator-bucket-${props.stage}`,
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          id: 'DeleteOldFiles',
          enabled: true,
          expiration: cdk.Duration.days(30), // 30日後に自動削除
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(7),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(14),
            },
          ],
        },
        {
          id: 'DeleteIncompleteMultipartUploads',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // バケット内のフォルダ構造を明確にするためのコメント
    // Structure:
    // ├── images/          # DALL-E で生成された画像
    // ├── audio/           # Polly で生成された音声ファイル
    // ├── videos/          # 最終的な動画ファイル
    // ├── scripts/         # 生成された台本ファイル
    // └── temp/            # 一時ファイル

    // CloudWatch メトリクス有効化
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Name of the S3 bucket for video generation',
      exportName: `VideoGenerator-Bucket-Name-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'ARN of the S3 bucket for video generation',
      exportName: `VideoGenerator-Bucket-Arn-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'BucketUrl', {
      value: `https://${this.bucket.bucketName}.s3.${this.region}.amazonaws.com`,
      description: 'URL of the S3 bucket for video generation',
      exportName: `VideoGenerator-Bucket-Url-${props.stage}`,
    });
  }
}
