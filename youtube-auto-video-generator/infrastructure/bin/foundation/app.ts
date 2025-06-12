#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3Stack } from '../../lib/foundation/s3-stack';
import { IAMStack } from '../../lib/foundation/iam-stack';
import { SecretsStack } from '../../lib/foundation/secrets-stack';
import { getStageConfig } from '../../config/stage-config';
import { ResourceNaming } from '../../config/resource-naming';

const app = new cdk.App();

// Get stage from context or default to 'dev'
const stage = app.node.tryGetContext('stage') || 'dev';
const config = getStageConfig(stage);
const naming = new ResourceNaming(stage);

// Define common props
const commonProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
  stage,
};

// Foundation Layer - Phase 1
const s3Stack = new S3Stack(app, naming.s3StackName(), commonProps);

const iamStack = new IAMStack(app, naming.iamStackName(), commonProps);

const secretsStack = new SecretsStack(app, naming.secretsStackName(), commonProps);

// Add dependencies to ensure proper deployment order
// IAM and Secrets don't depend on S3, but we deploy S3 first for clarity
secretsStack.addDependency(s3Stack);
secretsStack.addDependency(iamStack);
