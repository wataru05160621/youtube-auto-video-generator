import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';

export interface LambdaLightStackProps extends cdk.StackProps {
  stage: string;
}

export class LambdaLightStack extends cdk.Stack {
  public readonly readSpreadsheetFunction: lambda.Function;
  public readonly generateScriptFunction: lambda.Function;
  public readonly writeScriptFunction: lambda.Function;
  public readonly generateImageFunction: lambda.Function;
  public readonly synthesizeSpeechFunction: lambda.Function;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: LambdaLightStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // Import cross-stack resources
    const lambdaLightRoleArn = cdk.Fn.importValue(
      this.naming.exportName('IAM', 'LambdaLightRoleArn')
    );
    const lambdaLightRole = iam.Role.fromRoleArn(
      this,
      'ImportedLambdaLightRole',
      lambdaLightRoleArn
    );

    const commonLayerArn = cdk.Fn.importValue(
      this.naming.exportName('Layers', 'CommonLayerArn')
    );
    const commonLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'ImportedCommonLayer',
      commonLayerArn
    );

    const googleApisLayerArn = cdk.Fn.importValue(
      this.naming.exportName('Layers', 'GoogleApisLayerArn')
    );
    const googleApisLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'ImportedGoogleApisLayer',
      googleApisLayerArn
    );

    // Common configuration for lightweight Lambda functions
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      role: lambdaLightRole,
      layers: [commonLayer, googleApisLayer],
      environment: {
        STAGE: props.stage,
        NODE_OPTIONS: '--enable-source-maps',
      },
    };

    // 1. ReadSpreadsheetFunction - Google Spreadsheet データ読み取り
    this.readSpreadsheetFunction = new lambda.Function(this, 'ReadSpreadsheetFunction', {
      ...commonLambdaProps,
      functionName: this.naming.lambdaFunctionName('ReadSpreadsheet'),
      code: lambda.Code.fromAsset('../src/lambda-light/ReadSpreadsheetFunction'),
      handler: 'index.handler',
      description: 'Read video data from Google Spreadsheet',
    });

    // 2. GenerateScriptFunction - OpenAI API でスクリプト生成
    this.generateScriptFunction = new lambda.Function(this, 'GenerateScriptFunction', {
      ...commonLambdaProps,
      functionName: this.naming.lambdaFunctionName('GenerateScript'),
      code: lambda.Code.fromAsset('../src/lambda-light/GenerateScriptFunction'),
      handler: 'index.handler',
      description: 'Generate video script using OpenAI API',
      timeout: cdk.Duration.minutes(10), // OpenAI API calls may take longer
    });

    // 3. WriteScriptFunction - 生成されたスクリプトをスプレッドシートに書き込み
    this.writeScriptFunction = new lambda.Function(this, 'WriteScriptFunction', {
      ...commonLambdaProps,
      functionName: this.naming.lambdaFunctionName('WriteScript'),
      code: lambda.Code.fromAsset('../src/lambda-light/WriteScriptFunction'),
      handler: 'index.handler',
      description: 'Write generated script back to Google Spreadsheet',
    });

    // 4. GenerateImageFunction - OpenAI DALL-E でイメージ生成
    this.generateImageFunction = new lambda.Function(this, 'GenerateImageFunction', {
      ...commonLambdaProps,
      functionName: this.naming.lambdaFunctionName('GenerateImage'),
      code: lambda.Code.fromAsset('../src/lambda-light/GenerateImageFunction'),
      handler: 'index.handler',
      description: 'Generate images using OpenAI DALL-E API',
      timeout: cdk.Duration.minutes(10), // Image generation may take longer
    });

    // 5. SynthesizeSpeechFunction - Amazon Polly で音声合成
    this.synthesizeSpeechFunction = new lambda.Function(this, 'SynthesizeSpeechFunction', {
      ...commonLambdaProps,
      functionName: this.naming.lambdaFunctionName('SynthesizeSpeech'),
      code: lambda.Code.fromAsset('../src/lambda-light/SynthesizeSpeechFunction'),
      handler: 'index.handler',
      description: 'Synthesize speech using Amazon Polly',
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, 'ReadSpreadsheetFunctionArn', {
      value: this.readSpreadsheetFunction.functionArn,
      exportName: this.naming.exportName('LambdaLight', 'ReadSpreadsheetFunctionArn'),
      description: 'ARN of the ReadSpreadsheet function',
    });

    new cdk.CfnOutput(this, 'GenerateScriptFunctionArn', {
      value: this.generateScriptFunction.functionArn,
      exportName: this.naming.exportName('LambdaLight', 'GenerateScriptFunctionArn'),
      description: 'ARN of the GenerateScript function',
    });

    new cdk.CfnOutput(this, 'WriteScriptFunctionArn', {
      value: this.writeScriptFunction.functionArn,
      exportName: this.naming.exportName('LambdaLight', 'WriteScriptFunctionArn'),
      description: 'ARN of the WriteScript function',
    });

    new cdk.CfnOutput(this, 'GenerateImageFunctionArn', {
      value: this.generateImageFunction.functionArn,
      exportName: this.naming.exportName('LambdaLight', 'GenerateImageFunctionArn'),
      description: 'ARN of the GenerateImage function',
    });

    new cdk.CfnOutput(this, 'SynthesizeSpeechFunctionArn', {
      value: this.synthesizeSpeechFunction.functionArn,
      exportName: this.naming.exportName('LambdaLight', 'SynthesizeSpeechFunctionArn'),
      description: 'ARN of the SynthesizeSpeech function',
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'YouTube-Auto-Video-Generator');
    cdk.Tags.of(this).add('Stage', props.stage);
    cdk.Tags.of(this).add('Layer', 'Application');
  }
}
