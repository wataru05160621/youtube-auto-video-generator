#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { LayersStack } from "../../lib/infrastructure/layers-stack";
import { SNSStack } from "../../lib/infrastructure/sns-stack";
import { EventsStack } from "../../lib/infrastructure/events-stack";
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

// Infrastructure Layer - Phase 2
const layersStack = new LayersStack(app, naming.layersStackName(), commonProps);

const snsStack = new SNSStack(app, naming.snsStackName(), commonProps);

const eventsStack = new EventsStack(app, naming.eventsStackName(), commonProps);

// Add dependencies - SNS and Events can be deployed in parallel after Layers
snsStack.addDependency(layersStack);
eventsStack.addDependency(layersStack);
