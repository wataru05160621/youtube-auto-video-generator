import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import { ResourceNaming } from "../../config/resource-naming";

export interface SNSStackProps extends cdk.StackProps {
  stage: string;
}

export class SNSStack extends cdk.Stack {
  public readonly videoProcessingTopic: sns.Topic;
  public readonly errorNotificationTopic: sns.Topic;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: SNSStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Topic for video processing notifications
    this.videoProcessingTopic = new sns.Topic(this, "VideoProcessingTopic", {
      topicName: this.naming.snsTopicName("VideoProcessing"),
      displayName: "Video Generation Processing Status",
      fifo: false,
    });

    // Topic for error notifications
    this.errorNotificationTopic = new sns.Topic(
      this,
      "ErrorNotificationTopic",
      {
        topicName: this.naming.snsTopicName("ErrorNotification"),
        displayName: "Video Generation Error Notifications",
        fifo: false,
      }
    );

    // Optional: Add email subscription for error notifications (uncomment and set email)
    // this.errorNotificationTopic.addSubscription(
    //   new snsSubscriptions.EmailSubscription('your-email@example.com')
    // );

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, "VideoProcessingTopicArn", {
      value: this.videoProcessingTopic.topicArn,
      exportName: this.naming.exportName("SNS", "VideoProcessingTopicArn"),
      description: "ARN of the video processing SNS topic",
    });

    new cdk.CfnOutput(this, "ErrorNotificationTopicArn", {
      value: this.errorNotificationTopic.topicArn,
      exportName: this.naming.exportName("SNS", "ErrorNotificationTopicArn"),
      description: "ARN of the error notification SNS topic",
    });

    // Tags
    cdk.Tags.of(this).add("Project", "YouTube-Auto-Video-Generator");
    cdk.Tags.of(this).add("Stage", props.stage);
    cdk.Tags.of(this).add("Layer", "Infrastructure");
  }
}
