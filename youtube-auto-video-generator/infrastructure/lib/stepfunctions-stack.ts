import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { LambdaFunctions } from './lambda-stack';

export interface StepFunctionsStackProps extends cdk.StackProps {
  stage: string;
  lambdaFunctions: LambdaFunctions;
  executionRole: iam.Role;
}

export class StepFunctionsStack extends cdk.Stack {
  public readonly stateMachine: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsStackProps) {
    super(scope, id, props);

    // CloudWatch Logs グループ
    const logGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: `/aws/stepfunctions/video-generator-${props.stage}`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // Step Functions のタスク定義
    const readSpreadsheetTask = new stepfunctionsTasks.LambdaInvoke(this, 'ReadSpreadsheetTask', {
      lambdaFunction: props.lambdaFunctions.readSpreadsheetFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const generateScriptTask = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateScriptTask', {
      lambdaFunction: props.lambdaFunctions.generateScriptFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const writeScriptTask = new stepfunctionsTasks.LambdaInvoke(this, 'WriteScriptTask', {
      lambdaFunction: props.lambdaFunctions.writeScriptFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const generateImageTask = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateImageTask', {
      lambdaFunction: props.lambdaFunctions.generateImageFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const synthesizeSpeechTask = new stepfunctionsTasks.LambdaInvoke(this, 'SynthesizeSpeechTask', {
      lambdaFunction: props.lambdaFunctions.synthesizeSpeechFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const composeVideoTask = new stepfunctionsTasks.LambdaInvoke(this, 'ComposeVideoTask', {
      lambdaFunction: props.lambdaFunctions.composeVideoFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const uploadToYouTubeTask = new stepfunctionsTasks.LambdaInvoke(this, 'UploadToYouTubeTask', {
      lambdaFunction: props.lambdaFunctions.uploadToYouTubeFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    // 並列処理タスク（画像生成と音声合成を並列実行）
    const parallelTasks = new stepfunctions.Parallel(this, 'ParallelImageAndAudio')
      .branch(generateImageTask)
      .branch(synthesizeSpeechTask);

    // エラーハンドリング
    const errorNotification = new stepfunctions.Pass(this, 'ErrorNotification', {
      result: stepfunctions.Result.fromObject({
        status: 'ERROR',
        message: 'Video generation failed',
      }),
    });

    const successNotification = new stepfunctions.Pass(this, 'SuccessNotification', {
      result: stepfunctions.Result.fromObject({
        status: 'SUCCESS',
        message: 'Video generation completed successfully',
      }),
    });

    // 条件分岐：スプレッドシートに未処理行があるかチェック
    const checkDataCondition = new stepfunctions.Choice(this, 'CheckDataCondition')
      .when(
        stepfunctions.Condition.stringEquals('$.hasData', 'false'),
        new stepfunctions.Pass(this, 'NoDataToProcess', {
          result: stepfunctions.Result.fromObject({
            status: 'NO_DATA',
            message: 'No unprocessed rows found in spreadsheet',
          }),
        })
      )
      .otherwise(
        generateScriptTask
          .next(writeScriptTask)
          .next(parallelTasks)
          .next(composeVideoTask)
          .next(uploadToYouTubeTask)
          .next(successNotification)
      );

    // ワークフロー定義
    const definition = readSpreadsheetTask
      .next(checkDataCondition);

    // State Machine の作成
    this.stateMachine = new stepfunctions.StateMachine(this, 'VideoGeneratorStateMachine', {
      stateMachineName: `video-generator-workflow-${props.stage}`,
      definition,
      role: props.executionRole,
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
      timeout: cdk.Duration.hours(2),
    });

    // EventBridge スケジューラー（毎日 JST 4:00 = UTC 19:00）
    const schedulerRule = new events.Rule(this, 'VideoGenerationSchedule', {
      ruleName: `video-generator-schedule-${props.stage}`,
      description: 'Daily trigger for video generation workflow',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '19', // UTC 19:00 = JST 4:00
        day: '*',
        month: '*',
        year: '*',
      }),
      enabled: true,
    });

    // EventBridge のターゲットとして State Machine を設定
    schedulerRule.addTarget(new eventsTargets.SfnStateMachine(this.stateMachine, {
      input: events.RuleTargetInput.fromObject({
        source: 'eventbridge-scheduler',
        timestamp: events.RuleTargetInput.fromText('${aws.events.event.timestamp}'),
        stage: props.stage,
      }),
    }));

    // 手動実行用のEventBridge ルール（テスト用）
    const manualTriggerRule = new events.Rule(this, 'ManualVideoGenerationTrigger', {
      ruleName: `video-generator-manual-trigger-${props.stage}`,
      description: 'Manual trigger for video generation workflow',
      eventPattern: {
        source: ['video-generator.manual'],
        detailType: ['Manual Trigger'],
      },
      enabled: true,
    });

    manualTriggerRule.addTarget(new eventsTargets.SfnStateMachine(this.stateMachine, {
      input: events.RuleTargetInput.fromEventPath('$.detail'),
    }));

    // Output values
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      description: 'ARN of the Step Functions state machine',
      exportName: `VideoGenerator-StateMachine-Arn-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'SchedulerRuleArn', {
      value: schedulerRule.ruleArn,
      description: 'ARN of the EventBridge scheduler rule',
      exportName: `VideoGenerator-Scheduler-Rule-Arn-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'ManualTriggerRuleArn', {
      value: manualTriggerRule.ruleArn,
      description: 'ARN of the manual trigger EventBridge rule',
      exportName: `VideoGenerator-Manual-Trigger-Rule-Arn-${props.stage}`,
    });
  }
}
