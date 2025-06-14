import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { ResourceNaming } from "../../config/resource-naming";

export interface IAMStackProps extends cdk.StackProps {
  stage: string;
}

export class IAMStack extends cdk.Stack {
  public readonly lambdaLightRole: iam.Role;
  public readonly lambdaHeavyRole: iam.Role;
  public readonly stepFunctionsRole: iam.Role;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: IAMStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Role for lightweight Lambda functions
    this.lambdaLightRole = new iam.Role(this, "LambdaLightRole", {
      roleName: this.naming.iamRoleName("LambdaLight"),
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
              ],
              resources: [
                `arn:aws:s3:::${this.naming.s3Bucket("videos")}`,
                `arn:aws:s3:::${this.naming.s3Bucket("videos")}/*`,
                `arn:aws:s3:::${this.naming.s3Bucket("assets")}`,
                `arn:aws:s3:::${this.naming.s3Bucket("assets")}/*`,
              ],
            }),
          ],
        }),
        SecretsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["secretsmanager:GetSecretValue"],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${
                  this.account
                }:secret:${this.naming.secretName("openai")}*`,
                `arn:aws:secretsmanager:${this.region}:${
                  this.account
                }:secret:${this.naming.secretName("google")}*`,
              ],
            }),
          ],
        }),
        PollyAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["polly:SynthesizeSpeech"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // Role for heavy Lambda functions (Container Image)
    this.lambdaHeavyRole = new iam.Role(this, "LambdaHeavyRole", {
      roleName: this.naming.iamRoleName("LambdaHeavy"),
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
              ],
              resources: [
                `arn:aws:s3:::${this.naming.s3Bucket("videos")}`,
                `arn:aws:s3:::${this.naming.s3Bucket("videos")}/*`,
                `arn:aws:s3:::${this.naming.s3Bucket("assets")}`,
                `arn:aws:s3:::${this.naming.s3Bucket("assets")}/*`,
              ],
            }),
          ],
        }),
        SecretsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["secretsmanager:GetSecretValue"],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${
                  this.account
                }:secret:${this.naming.secretName("youtube")}*`,
                `arn:aws:secretsmanager:${this.region}:${
                  this.account
                }:secret:${this.naming.secretName("google")}*`,
              ],
            }),
          ],
        }),
      },
    });

    // Role for Step Functions
    this.stepFunctionsRole = new iam.Role(this, "StepFunctionsRole", {
      roleName: this.naming.iamRoleName("StepFunctions"),
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      inlinePolicies: {
        LambdaInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["lambda:InvokeFunction"],
              resources: [
                `arn:aws:lambda:${this.region}:${
                  this.account
                }:function:${this.naming.lambdaFunctionName("*")}`,
              ],
            }),
          ],
        }),
        CloudWatchLogs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:CreateLogDelivery",
                "logs:GetLogDelivery",
                "logs:UpdateLogDelivery",
                "logs:DeleteLogDelivery",
                "logs:ListLogDeliveries",
                "logs:PutResourcePolicy",
                "logs:DescribeResourcePolicies",
                "logs:DescribeLogGroups",
              ],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, "LambdaLightRoleArn", {
      value: this.lambdaLightRole.roleArn,
      exportName: this.naming.exportName("IAM", "LambdaLightRoleArn"),
      description: "ARN of the Lambda Light execution role",
    });

    new cdk.CfnOutput(this, "LambdaHeavyRoleArn", {
      value: this.lambdaHeavyRole.roleArn,
      exportName: this.naming.exportName("IAM", "LambdaHeavyRoleArn"),
      description: "ARN of the Lambda Heavy execution role",
    });

    new cdk.CfnOutput(this, "StepFunctionsRoleArn", {
      value: this.stepFunctionsRole.roleArn,
      exportName: this.naming.exportName("IAM", "StepFunctionsRoleArn"),
      description: "ARN of the Step Functions execution role",
    });

    // Tags
    cdk.Tags.of(this).add("Project", "YouTube-Auto-Video-Generator");
    cdk.Tags.of(this).add("Stage", props.stage);
    cdk.Tags.of(this).add("Layer", "Foundation");
  }
}
