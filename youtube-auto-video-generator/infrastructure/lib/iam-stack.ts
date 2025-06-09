import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IamStackProps extends cdk.StackProps {
  stage: string;
}

export class IamStack extends cdk.Stack {
  public readonly lambdaExecutionRole: iam.Role;
  public readonly stepFunctionsExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    // Lambda 実行ロール
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `VideoGenerator-Lambda-Role-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        LambdaCustomPolicy: new iam.PolicyDocument({
          statements: [
            // S3 アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                `arn:aws:s3:::video-generator-bucket-${props.stage}`,
                `arn:aws:s3:::video-generator-bucket-${props.stage}/*`,
              ],
            }),
            // Secrets Manager アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:video-generator/*`,
              ],
            }),
            // Polly アクセス権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'polly:SynthesizeSpeech',
                'polly:DescribeVoices',
              ],
              resources: ['*'],
            }),
            // SNS 発行権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:video-generator-notifications-${props.stage}`,
              ],
            }),
            // CloudWatch Logs 権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/video-generator-*`,
              ],
            }),
          ],
        }),
      },
    });

    // Step Functions 実行ロール
    this.stepFunctionsExecutionRole = new iam.Role(this, 'StepFunctionsExecutionRole', {
      roleName: `VideoGenerator-StepFunctions-Role-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        StepFunctionsCustomPolicy: new iam.PolicyDocument({
          statements: [
            // Lambda 実行権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'lambda:InvokeFunction',
              ],
              resources: [
                `arn:aws:lambda:${this.region}:${this.account}:function:video-generator-*-${props.stage}`,
              ],
            }),
            // CloudWatch Logs 権限
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:CreateLogDelivery',
                'logs:GetLogDelivery',
                'logs:UpdateLogDelivery',
                'logs:DeleteLogDelivery',
                'logs:ListLogDeliveries',
                'logs:PutResourcePolicy',
                'logs:DescribeResourcePolicies',
                'logs:DescribeLogGroups',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Output values for other stacks
    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: this.lambdaExecutionRole.roleArn,
      description: 'ARN of the Lambda execution role',
      exportName: `VideoGenerator-Lambda-Role-Arn-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'StepFunctionsExecutionRoleArn', {
      value: this.stepFunctionsExecutionRole.roleArn,
      description: 'ARN of the Step Functions execution role',
      exportName: `VideoGenerator-StepFunctions-Role-Arn-${props.stage}`,
    });
  }
}
