import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface SnsStackProps extends cdk.StackProps {
  stage: string;
}

export class SnsStack extends cdk.Stack {
  public readonly notificationTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SnsStackProps) {
    super(scope, id, props);

    // メイン通知トピック
    this.notificationTopic = new sns.Topic(this, 'NotificationTopic', {
      topicName: `video-generator-notifications-${props.stage}`,
      displayName: `Video Generator Notifications (${props.stage})`,
    });

    // エラー通知用のトピック
    const errorTopic = new sns.Topic(this, 'ErrorNotificationTopic', {
      topicName: `video-generator-errors-${props.stage}`,
      displayName: `Video Generator Errors (${props.stage})`,
    });

    // 成功通知用のトピック
    const successTopic = new sns.Topic(this, 'SuccessNotificationTopic', {
      topicName: `video-generator-success-${props.stage}`,
      displayName: `Video Generator Success (${props.stage})`,
    });

    // メール通知の購読を追加（環境変数で設定）
    const notificationEmail = this.node.tryGetContext('notificationEmail');
    if (notificationEmail) {
      this.notificationTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(notificationEmail)
      );

      errorTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(notificationEmail)
      );

      successTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(notificationEmail)
      );
    }

    // Slack通知の設定（Webhook URL が提供されている場合）
    const slackWebhookUrl = this.node.tryGetContext('slackWebhookUrl');
    if (slackWebhookUrl) {
      // Slack 通知用のHTTPS endpoint subscription
      // 実際の実装では Lambda 関数を経由してSlackに通知
      this.notificationTopic.addSubscription(
        new snsSubscriptions.UrlSubscription(slackWebhookUrl, {
          protocol: sns.SubscriptionProtocol.HTTPS,
        })
      );
    }

    // CloudWatch メトリクス用のフィルター設定
    this.notificationTopic.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'AllowCloudWatchAlarmsToPublish',
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.notificationTopic.topicArn],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
        },
      })
    );

    // Output values
    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: this.notificationTopic.topicArn,
      description: 'ARN of the main notification topic',
      exportName: `VideoGenerator-Notification-Topic-Arn-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'ErrorTopicArn', {
      value: errorTopic.topicArn,
      description: 'ARN of the error notification topic',
      exportName: `VideoGenerator-Error-Topic-Arn-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'SuccessTopicArn', {
      value: successTopic.topicArn,
      description: 'ARN of the success notification topic',
      exportName: `VideoGenerator-Success-Topic-Arn-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'NotificationTopicName', {
      value: this.notificationTopic.topicName,
      description: 'Name of the main notification topic',
      exportName: `VideoGenerator-Notification-Topic-Name-${props.stage}`,
    });
  }
}
