import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { ResourceNaming } from "../../config/resource-naming";

export interface EventsStackProps extends cdk.StackProps {
  stage: string;
  stateMachine?: stepfunctions.StateMachine;
}

export class EventsStack extends cdk.Stack {
  public readonly scheduledEventBus: events.EventBus;
  public readonly manualTriggerRule: events.Rule;
  public readonly scheduledRule: events.Rule;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: EventsStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Custom EventBus for video generation events
    this.scheduledEventBus = new events.EventBus(this, "VideoGenEventBus", {
      eventBusName: this.naming.snsTopicName("VideoGenEvents"),
      description: "EventBus for video generation workflow triggers",
    });

    // Rule for manual triggers
    this.manualTriggerRule = new events.Rule(this, "ManualTriggerRule", {
      ruleName: this.naming.lambdaFunctionName("manual-trigger-rule"),
      description: "Rule for manual video generation triggers",
      eventBus: this.scheduledEventBus,
      eventPattern: {
        source: ["youtube-video-generator"],
        detailType: ["Manual Trigger"],
      },
      enabled: true,
    });

    // Rule for scheduled triggers (daily at 9 AM JST) - uses default event bus
    this.scheduledRule = new events.Rule(this, "ScheduledRule", {
      ruleName: this.naming.lambdaFunctionName("scheduled-rule"),
      description: "Rule for scheduled video generation (daily 9 AM JST)",
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "0", // 0 UTC = 9 AM JST
        day: "*",
        month: "*",
        year: "*",
      }),
      enabled: true, // Enabled for daily execution
    });

    // IAM role for EventBridge to invoke Step Functions
    const eventBridgeRole = new iam.Role(this, "EventBridgeRole", {
      roleName: this.naming.iamRoleName("EventBridge"),
      assumedBy: new iam.ServicePrincipal("events.amazonaws.com"),
      inlinePolicies: {
        StepFunctionsInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["states:StartExecution"],
              resources: [
                `arn:aws:states:${this.region}:${
                  this.account
                }:stateMachine:${this.naming.stateMachineName()}`,
              ],
            }),
          ],
        }),
      },
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, "VideoGenEventBusArn", {
      value: this.scheduledEventBus.eventBusArn,
      exportName: this.naming.exportName("Events", "VideoGenEventBusArn"),
      description: "ARN of the video generation EventBus",
    });

    new cdk.CfnOutput(this, "VideoGenEventBusName", {
      value: this.scheduledEventBus.eventBusName,
      exportName: this.naming.exportName("Events", "VideoGenEventBusName"),
      description: "Name of the video generation EventBus",
    });

    new cdk.CfnOutput(this, "ManualTriggerRuleArn", {
      value: this.manualTriggerRule.ruleArn,
      exportName: this.naming.exportName("Events", "ManualTriggerRuleArn"),
      description: "ARN of the manual trigger rule",
    });

    new cdk.CfnOutput(this, "ScheduledRuleArn", {
      value: this.scheduledRule.ruleArn,
      exportName: this.naming.exportName("Events", "ScheduledRuleArn"),
      description: "ARN of the scheduled trigger rule",
    });

    new cdk.CfnOutput(this, "EventBridgeRoleArn", {
      value: eventBridgeRole.roleArn,
      exportName: this.naming.exportName("Events", "EventBridgeRoleArn"),
      description: "ARN of the EventBridge execution role",
    });

    // Tags
    cdk.Tags.of(this).add("Project", "YouTube-Auto-Video-Generator");
    cdk.Tags.of(this).add("Stage", props.stage);
    cdk.Tags.of(this).add("Layer", "Infrastructure");
  }
}
