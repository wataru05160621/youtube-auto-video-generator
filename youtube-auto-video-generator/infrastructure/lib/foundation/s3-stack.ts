import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { ResourceNaming } from "../../config/resource-naming";

export interface S3StackProps extends cdk.StackProps {
  stage: string;
}

export class S3Stack extends cdk.Stack {
  public readonly videoBucket: s3.Bucket;
  public readonly assetsBucket: s3.Bucket;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Main video storage bucket
    this.videoBucket = new s3.Bucket(this, "VideoBucket", {
      bucketName: this.naming.s3Bucket("videos"),
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          id: "DeleteOldFiles",
          enabled: true,
          expiration: cdk.Duration.days(30), // Clean up old files after 30 days
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
      autoDeleteObjects: true, // For dev environment
    });

    // Assets bucket for images, audio, etc.
    this.assetsBucket = new s3.Bucket(this, "AssetsBucket", {
      bucketName: this.naming.s3Bucket("assets"),
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          id: "DeleteOldFiles",
          enabled: true,
          expiration: cdk.Duration.days(7), // Clean up assets after 7 days
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
      autoDeleteObjects: true, // For dev environment
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, "VideoBucketName", {
      value: this.videoBucket.bucketName,
      exportName: this.naming.exportName("S3", "VideoBucketName"),
      description: "Name of the main video storage bucket",
    });

    new cdk.CfnOutput(this, "VideoBucketArn", {
      value: this.videoBucket.bucketArn,
      exportName: this.naming.exportName("S3", "VideoBucketArn"),
      description: "ARN of the main video storage bucket",
    });

    new cdk.CfnOutput(this, "AssetsBucketName", {
      value: this.assetsBucket.bucketName,
      exportName: this.naming.exportName("S3", "AssetsBucketName"),
      description: "Name of the assets storage bucket",
    });

    new cdk.CfnOutput(this, "AssetsBucketArn", {
      value: this.assetsBucket.bucketArn,
      exportName: this.naming.exportName("S3", "AssetsBucketArn"),
      description: "ARN of the assets storage bucket",
    });

    // Tags
    cdk.Tags.of(this).add("Project", "YouTube-Auto-Video-Generator");
    cdk.Tags.of(this).add("Stage", props.stage);
    cdk.Tags.of(this).add("Layer", "Foundation");
  }
}
