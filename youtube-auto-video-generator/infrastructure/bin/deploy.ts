#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IamStack } from '../lib/iam-stack';
import { S3Stack } from '../lib/s3-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { StepFunctionsStack } from '../lib/stepfunctions-stack';
import { SnsStack } from '../lib/sns-stack';

const app = new cdk.App();

// 環境設定
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// ステージ名取得（dev/prod）
const stage = app.node.tryGetContext('stage') || 'dev';

// IAM ロール・ポリシーの作成
const iamStack = new IamStack(app, `VideoGenerator-IAM-${stage}`, {
  env,
  stage,
});

// S3 バケットの作成
const s3Stack = new S3Stack(app, `VideoGenerator-S3-${stage}`, {
  env,
  stage,
});

// Lambda 関数の作成
const lambdaStack = new LambdaStack(app, `VideoGenerator-Lambda-${stage}`, {
  env,
  stage,
  executionRole: iamStack.lambdaExecutionRole,
  s3Bucket: s3Stack.bucket,
});

// Step Functions とEventBridge の作成
const stepFunctionsStack = new StepFunctionsStack(app, `VideoGenerator-StepFunctions-${stage}`, {
  env,
  stage,
  lambdaFunctions: lambdaStack.functions,
  executionRole: iamStack.stepFunctionsExecutionRole,
});

// SNS 通知の作成（オプション）
const snsStack = new SnsStack(app, `VideoGenerator-SNS-${stage}`, {
  env,
  stage,
});

// スタック間の依存関係設定
s3Stack.addDependency(iamStack);
lambdaStack.addDependency(iamStack);
lambdaStack.addDependency(s3Stack);
stepFunctionsStack.addDependency(lambdaStack);
snsStack.addDependency(lambdaStack);
