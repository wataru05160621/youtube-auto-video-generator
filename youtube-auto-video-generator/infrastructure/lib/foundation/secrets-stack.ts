import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { ResourceNaming } from "../../config/resource-naming";

export interface SecretsStackProps extends cdk.StackProps {
  stage: string;
}

export class SecretsStack extends cdk.Stack {
  public readonly openaiSecret: secretsmanager.Secret;
  public readonly googleSecret: secretsmanager.Secret;
  public readonly youtubeSecret: secretsmanager.Secret;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.stage);

    // OpenAI API Secret
    this.openaiSecret = new secretsmanager.Secret(this, "OpenAISecret", {
      secretName: this.naming.secretName("openai"),
      description: "OpenAI API credentials for video generation",
      generateSecretString: {
        secretStringTemplate: "{}",
        generateStringKey: "api_key",
        excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
      },
    });

    // Google APIs Secret (for Spreadsheet and YouTube)
    this.googleSecret = new secretsmanager.Secret(this, "GoogleSecret", {
      secretName: this.naming.secretName("google"),
      description: "Google APIs credentials for Spreadsheet access",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          type: "service_account",
          project_id: "",
          private_key_id: "",
          private_key: "",
          client_email: "",
          client_id: "",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url:
            "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: "",
        }),
        generateStringKey: "credentials",
        excludeCharacters: "",
      },
    });

    // YouTube API Secret
    this.youtubeSecret = new secretsmanager.Secret(this, "YouTubeSecret", {
      secretName: this.naming.secretName("youtube"),
      description: "YouTube API credentials for video upload",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          client_id: "",
          client_secret: "",
          refresh_token: "",
          type: "authorized_user",
        }),
        generateStringKey: "credentials",
        excludeCharacters: "",
      },
    });

    // Outputs for cross-stack references
    new cdk.CfnOutput(this, "OpenAISecretArn", {
      value: this.openaiSecret.secretArn,
      exportName: this.naming.exportName("Secrets", "OpenAISecretArn"),
      description: "ARN of the OpenAI API secret",
    });

    new cdk.CfnOutput(this, "GoogleSecretArn", {
      value: this.googleSecret.secretArn,
      exportName: this.naming.exportName("Secrets", "GoogleSecretArn"),
      description: "ARN of the Google APIs secret",
    });

    new cdk.CfnOutput(this, "YouTubeSecretArn", {
      value: this.youtubeSecret.secretArn,
      exportName: this.naming.exportName("Secrets", "YouTubeSecretArn"),
      description: "ARN of the YouTube API secret",
    });

    // Tags
    cdk.Tags.of(this).add("Project", "YouTube-Auto-Video-Generator");
    cdk.Tags.of(this).add("Stage", props.stage);
    cdk.Tags.of(this).add("Layer", "Foundation");
  }
}
