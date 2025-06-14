#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { LambdaLightStack } from "../../lib/application/lambda-light-stack";
import { LambdaHeavyStack } from "../../lib/application/lambda-heavy-stack";
import { StepFunctionsStack } from "../../lib/application/step-functions-stack";
import { getStageConfig } from "../../config/stage-config";
import { ResourceNaming } from "../../config/resource-naming";

const app = new cdk.App();

// Get stage from context or default to 'dev'
const stage = app.node.tryGetContext("stage") || "dev";
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

// Application Layer - Phase 3
// Deploy Lambda Light functions first
const lambdaLightStack = new LambdaLightStack(
  app,
  naming.lambdaLightStackName(),
  commonProps
);

// Deploy Lambda Heavy functions (can be parallel with Light)
const lambdaHeavyStack = new LambdaHeavyStack(
  app,
  naming.lambdaHeavyStackName(),
  commonProps
);

// Deploy Step Functions last (depends on all Lambda functions)
const stepFunctionsStack = new StepFunctionsStack(
  app,
  naming.stepFunctionsStackName(),
  commonProps
);

// Add dependencies to ensure proper deployment order
stepFunctionsStack.addDependency(lambdaLightStack);
stepFunctionsStack.addDependency(lambdaHeavyStack);
