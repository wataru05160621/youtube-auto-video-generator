#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3Stack } from '../lib/s3-stack';
import { LambdaLayersStack } from '../lib/lambda-layers-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { LambdaHeavyStack } from '../lib/lambda-heavy-stack';
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

// S3 バケットの作成
const s3Stack = new S3Stack(app, `VideoGenerator-S3-${stage}`, {
  env,
  stage,
});

// Lambda Layers の作成
const lambdaLayersStack = new LambdaLayersStack(app, `VideoGenerator-Layers-${stage}`, {
  env,
  stage,
});

// Lambda 関数の作成（IAMロールも含む）
const lambdaStack = new LambdaStack(app, `VideoGenerator-Lambda-${stage}`, {
  env,
  stage,
  s3Bucket: s3Stack.bucket,
  layersStack: lambdaLayersStack,
});

// 重い処理のLambda関数（別スタック）
const lambdaHeavyStack = new LambdaHeavyStack(app, `VideoGenerator-LambdaHeavy-${stage}`, {
  env,
  stage,
  s3Bucket: s3Stack.bucket,
  layersStack: lambdaLayersStack,
});

// Step Functions とEventBridge の作成
const stepFunctionsStack = new StepFunctionsStack(app, `VideoGenerator-StepFunctions-${stage}`, {
  env,
  stage,
  lambdaFunctions: lambdaStack.functions,
  heavyLambdaFunctions: lambdaHeavyStack.functions,
  executionRole: lambdaStack.stepFunctionsExecutionRole,
});

// SNS 通知の作成（オプション）
const snsStack = new SnsStack(app, `VideoGenerator-SNS-${stage}`, {
  env,
  stage,
});

// スタック間の依存関係設定
lambdaLayersStack.addDependency(s3Stack);
lambdaStack.addDependency(lambdaLayersStack);
lambdaHeavyStack.addDependency(lambdaLayersStack);
stepFunctionsStack.addDependency(lambdaStack);
stepFunctionsStack.addDependency(lambdaHeavyStack);
snsStack.addDependency(lambdaStack);
