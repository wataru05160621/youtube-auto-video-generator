import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { LambdaStack } from '../lambda-stack';

describe('LambdaStack', () => {
  test('should create Lambda functions', () => {
    const app = new cdk.App();
    
    // Create a test environment
    const env = {
      account: '123456789012',
      region: 'us-east-1',
    };
    
    // Create S3 bucket for test
    const testStack = new cdk.Stack(app, 'TestStack', { env });
    const s3Bucket = new s3.Bucket(testStack, 'TestBucket');
    
    // Create the stack
    const stack = new LambdaStack(app, 'TestLambdaStack', {
      env,
      stage: 'test',
      s3Bucket,
    });
    
    // Create template for assertions
    const template = Template.fromStack(stack);
    
    // Verify that Lambda functions are created
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs18.x',
    });
    
    // Verify that IAM roles are created
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
          Action: 'sts:AssumeRole',
        }],
      },
    });
    
    // Note: S3 bucket is passed as props, not created in this stack
  });
  
  test('should have correct number of Lambda functions', () => {
    const app = new cdk.App();
    
    const env = {
      account: '123456789012',
      region: 'us-east-1',
    };
    
    // Create S3 bucket for test
    const testStack = new cdk.Stack(app, 'TestStack2', { env });
    const s3Bucket = new s3.Bucket(testStack, 'TestBucket2');
    
    const stack = new LambdaStack(app, 'TestLambdaStack2', {
      env,
      stage: 'test',
      s3Bucket,
    });
    
    const template = Template.fromStack(stack);
    
    // We expect 7 Lambda functions based on our architecture
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    expect(Object.keys(lambdaFunctions)).toHaveLength(7);
  });
});
