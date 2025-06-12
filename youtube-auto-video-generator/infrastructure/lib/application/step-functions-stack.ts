import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';

export interface StepFunctionsStackProps extends cdk.StackProps {
  stage: string;
}

export class StepFunctionsStack extends cdk.Stack {
  public readonly videoGenerationStateMachine: stepfunctions.StateMachine;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: StepFunctionsStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Import cross-stack resources
    const stepFunctionsRoleArn = cdk.Fn.importValue(
      this.naming.exportName('IAM', 'StepFunctionsRoleArn')
    );
    const stepFunctionsRole = iam.Role.fromRoleArn(
      this,
      'ImportedStepFunctionsRole',
      stepFunctionsRoleArn
    );

    // Import Lambda functions
    const readSpreadsheetFunctionArn = cdk.Fn.importValue(
      this.naming.exportName('LambdaLight', 'ReadSpreadsheetFunctionArn')
    );
    const readSpreadsheetFunction = lambda.Function.fromFunctionArn(
      this,
      'ImportedReadSpreadsheetFunction',
      readSpreadsheetFunctionArn
    );

    const generateScriptFunctionArn = cdk.Fn.importValue(
      this.naming.exportName('LambdaLight', 'GenerateScriptFunctionArn')
    );
    const generateScriptFunction = lambda.Function.fromFunctionArn(
      this,
      'ImportedGenerateScriptFunction',
      generateScriptFunctionArn
    );

    const writeScriptFunctionArn = cdk.Fn.importValue(
      this.naming.exportName('LambdaLight', 'WriteScriptFunctionArn')
    );
    const writeScriptFunction = lambda.Function.fromFunctionArn(
      this,
      'ImportedWriteScriptFunction',
      writeScriptFunctionArn
    );

    const generateImageFunctionArn = cdk.Fn.importValue(
      this.naming.exportName('LambdaLight', 'GenerateImageFunctionArn')
    );
    const generateImageFunction = lambda.Function.fromFunctionArn(
      this,
      'ImportedGenerateImageFunction',
      generateImageFunctionArn
    );

    const synthesizeSpeechFunctionArn = cdk.Fn.importValue(
      this.naming.exportName('LambdaLight', 'SynthesizeSpeechFunctionArn')
    );
    const synthesizeSpeechFunction = lambda.Function.fromFunctionArn(
      this,
      'ImportedSynthesizeSpeechFunction',
      synthesizeSpeechFunctionArn
    );

    const composeVideoFunctionArn = cdk.Fn.importValue(
      this.naming.exportName('LambdaHeavy', 'ComposeVideoFunctionArn')
    );
    const composeVideoFunction = lambda.Function.fromFunctionArn(
      this,
      'ImportedComposeVideoFunction',
      composeVideoFunctionArn
    );

    const uploadToYouTubeFunctionArn = cdk.Fn.importValue(
      this.naming.exportName('LambdaHeavy', 'UploadToYouTubeFunctionArn')
    );
    const uploadToYouTubeFunction = lambda.Function.fromFunctionArn(
      this,
      'ImportedUploadToYouTubeFunction',
      uploadToYouTubeFunctionArn
    );

    // Define Step Functions tasks
    const readSpreadsheetTask = new stepfunctionsTasks.LambdaInvoke(this, 'ReadSpreadsheetTask', {
      lambdaFunction: readSpreadsheetFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const generateScriptTask = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateScriptTask', {
      lambdaFunction: generateScriptFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const writeScriptTask = new stepfunctionsTasks.LambdaInvoke(this, 'WriteScriptTask', {
      lambdaFunction: writeScriptFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const generateImageTask = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateImageTask', {
      lambdaFunction: generateImageFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const synthesizeSpeechTask = new stepfunctionsTasks.LambdaInvoke(this, 'SynthesizeSpeechTask', {
      lambdaFunction: synthesizeSpeechFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const composeVideoTask = new stepfunctionsTasks.LambdaInvoke(this, 'ComposeVideoTask', {
      lambdaFunction: composeVideoFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const uploadToYouTubeTask = new stepfunctionsTasks.LambdaInvoke(this, 'UploadToYouTubeTask', {
      lambdaFunction: uploadToYouTubeFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    // Define parallel tasks for resource generation
    const generateResourcesParallel = new stepfunctions.Parallel(this, 'GenerateResourcesParallel', {
      comment: 'Generate images and speech in parallel',
    });

    generateResourcesParallel.branch(generateImageTask);
    generateResourcesParallel.branch(synthesizeSpeechTask);

    // Define success and failure states
    const successState = new stepfunctions.Succeed(this, 'VideoGenerationSuccess', {
      comment: 'Video generation completed successfully',
    });

    const failureState = new stepfunctions.Fail(this, 'VideoGenerationFailure', {
      comment: 'Video generation failed',
    });

    // Add error handling to individual tasks
    readSpreadsheetTask.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    generateScriptTask.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    writeScriptTask.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    generateResourcesParallel.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    composeVideoTask.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    uploadToYouTubeTask.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // Define the workflow
    const definition = readSpreadsheetTask
      .next(generateScriptTask)
      .next(writeScriptTask)
      .next(generateResourcesParallel)
      .next(composeVideoTask)
      .next(uploadToYouTubeTask)
      .next(successState);

    // Create the state machine
    this.videoGenerationStateMachine = new stepfunctions.StateMachine(this, 'VideoGenerationStateMachine', {
      stateMachineName: this.naming.stateMachineName(),
      definition: definition,
      role: stepFunctionsRole,
      timeout: cdk.Duration.hours(1), // Maximum allowed timeout
      comment: 'YouTube Auto Video Generation Workflow',
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, 'VideoGenerationStateMachineArn', {
      value: this.videoGenerationStateMachine.stateMachineArn,
      exportName: this.naming.exportName('StepFunctions', 'VideoGenerationStateMachineArn'),
      description: 'ARN of the Video Generation State Machine',
    });

    new cdk.CfnOutput(this, 'VideoGenerationStateMachineName', {
      value: this.videoGenerationStateMachine.stateMachineName,
      exportName: this.naming.exportName('StepFunctions', 'VideoGenerationStateMachineName'),
      description: 'Name of the Video Generation State Machine',
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'YouTube-Auto-Video-Generator');
    cdk.Tags.of(this).add('Stage', props.stage);
    cdk.Tags.of(this).add('Layer', 'Application');
  }
}
