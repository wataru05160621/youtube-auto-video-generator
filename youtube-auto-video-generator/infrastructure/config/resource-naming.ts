/**
 * Unified resource naming strategy to avoid CloudFormation export conflicts
 */
export class ResourceNaming {
  private readonly prefix = "VideoGen";
  private readonly stage: string;

  constructor(stage: string) {
    this.stage = stage;
  }

  // Foundation Layer
  s3Bucket(purpose: string): string {
    return `${this.prefix.toLowerCase()}-${purpose}-${this.stage}`;
  }

  s3StackName(): string {
    return `${this.prefix}-S3-${this.stage}`;
  }

  iamStackName(): string {
    return `${this.prefix}-IAM-${this.stage}`;
  }

  secretsStackName(): string {
    return `${this.prefix}-Secrets-${this.stage}`;
  }

  // Infrastructure Layer
  layersStackName(): string {
    return `${this.prefix}-Layers-${this.stage}`;
  }

  snsStackName(): string {
    return `${this.prefix}-SNS-${this.stage}`;
  }

  eventsStackName(): string {
    return `${this.prefix}-Events-${this.stage}`;
  }

  // Application Layer
  lambdaLightStackName(): string {
    return `${this.prefix}-LambdaLight-${this.stage}`;
  }

  lambdaHeavyStackName(): string {
    return `${this.prefix}-LambdaHeavy-${this.stage}`;
  }

  stepFunctionsStackName(): string {
    return `${this.prefix}-StepFunctions-${this.stage}`;
  }

  // Lambda function names
  lambdaFunctionName(functionName: string): string {
    return `${this.prefix.toLowerCase()}-${functionName.toLowerCase()}-${
      this.stage
    }`;
  }

  // IAM role names
  iamRoleName(roleName: string): string {
    return `${this.prefix}-${roleName}-${this.stage}`;
  }

  // Secrets Manager secret names
  secretName(secretType: string): string {
    return `${this.prefix.toLowerCase()}/${secretType}-${this.stage}`;
  }

  // SNS topic names
  snsTopicName(topicName: string): string {
    return `${this.prefix}-${topicName}-${this.stage}`;
  }

  // Step Functions state machine name
  stateMachineName(): string {
    return `${this.prefix}-VideoGeneration-${this.stage}`;
  }

  // Export names (CloudFormation)
  exportName(resourceType: string, resourceName: string): string {
    return `${this.prefix}-${resourceType}-${resourceName}-${this.stage}`;
  }
}
