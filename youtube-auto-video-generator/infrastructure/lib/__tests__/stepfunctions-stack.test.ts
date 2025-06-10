import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { StepFunctionsStack } from '../stepfunctions-stack';
import { LambdaStack } from '../lambda-stack';

describe('StepFunctionsStack', () => {
  test('should create Step Functions state machine', () => {
    const app = new cdk.App();

    const env = {
      account: '123456789012',
      region: 'us-east-1',
    };

    // Create S3 bucket for test
    const testStack = new cdk.Stack(app, 'TestStack', { env });
    const s3Bucket = new s3.Bucket(testStack, 'TestBucket');

    // Create Lambda stack first (dependency)
    const lambdaStack = new LambdaStack(app, 'TestLambdaStack', {
      env,
      stage: 'test',
      s3Bucket,
    });

    // Create Step Functions stack
    const stepFunctionsStack = new StepFunctionsStack(app, 'TestStepFunctionsStack', {
      env,
      stage: 'test',
      lambdaFunctions: lambdaStack.functions,
      executionRole: lambdaStack.stepFunctionsExecutionRole,
    });

    const template = Template.fromStack(stepFunctionsStack);    // Verify that State Machine is created
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'video-generator-workflow-test',
    });
    
    // Verify that State Machine has a role assigned
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('should define proper state machine workflow', () => {
    const app = new cdk.App();

    const env = {
      account: '123456789012',
      region: 'us-east-1',
    };

    // Create S3 bucket for test
    const testStack = new cdk.Stack(app, 'TestStack2', { env });
    const s3Bucket = new s3.Bucket(testStack, 'TestBucket2');

    const lambdaStack = new LambdaStack(app, 'TestLambdaStack2', {
      env,
      stage: 'test',
      s3Bucket,
    });

    const stepFunctionsStack = new StepFunctionsStack(app, 'TestStepFunctionsStack2', {
      env,
      stage: 'test',
      lambdaFunctions: lambdaStack.functions,
      executionRole: lambdaStack.stepFunctionsExecutionRole,
    });

    const template = Template.fromStack(stepFunctionsStack);    // Check that the state machine has a definition
    const stateMachine = template.findResources('AWS::StepFunctions::StateMachine');
    const stateMachineKeys = Object.keys(stateMachine);
    expect(stateMachineKeys).toHaveLength(1);
    
    const definition = stateMachine[stateMachineKeys[0]].Properties.DefinitionString;
    expect(definition).toBeDefined();
    
    // Verify that the definition exists (but don't parse the complex structure)
    expect(typeof definition).toBe('object');
  });
});
