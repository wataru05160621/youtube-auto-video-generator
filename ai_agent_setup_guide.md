# AI Agent Setup Instructions for YouTube Video Automation System

## Overview
This document provides step-by-step instructions for an AI agent to deploy and manage a fully serverless video automation pipeline using AWS. The system reads data from a Google Spreadsheet, uses OpenAI APIs for script generation, DALL·E for image creation, Amazon Polly for speech synthesis, FFmpeg for video composition, and uploads the final video to YouTube.

## Objectives
- Read data from Google Spreadsheet
- Generate title, script, and description using OpenAI API
- Generate static images with DALL·E
- Synthesize narration using Amazon Polly
- Compose video using FFmpeg
- Upload video to YouTube via API
- Automate workflow using AWS Step Functions

---

## 🏗 Directory Structure
```
infrastructure/
├── bin/
│   ├── foundation/
│   ├── infrastructure/
│   └── application/
├── lib/
│   ├── foundation/
│   ├── infrastructure/
│   └── application/
├── config/
│   ├── stage-config.ts
│   └── resource-naming.ts
```

## 🔧 Prerequisites for AI Agent
- AWS CDK installed
- AWS CLI configured with proper credentials
- Docker running (for Container Image Lambda)

---

## 🔄 Deployment Sequence

### Phase 1: Foundation Layer
1. Deploy S3 bucket
2. Deploy IAM roles
3. Deploy Secrets Manager secrets (OpenAI, Google, YouTube credentials)
```bash
cd infrastructure
npm run build
cdk deploy VideoGen-S3-dev --require-approval never
cdk deploy VideoGen-IAM-dev --require-approval never
cdk deploy VideoGen-Secrets-dev --require-approval never
```

### Phase 2: Infrastructure Layer
1. Deploy Lambda Layers (common, FFmpeg, Google APIs)
2. Deploy SNS
3. Deploy EventBridge (for scheduling and manual triggers)
```bash
cdk deploy VideoGen-Layers-dev --require-approval never
cdk deploy VideoGen-SNS-dev --require-approval never
cdk deploy VideoGen-Events-dev --require-approval never
```

### Phase 3: Application Layer
1. Deploy lightweight Lambda functions:
   - ReadSpreadsheetFunction
   - GenerateScriptFunction
   - WriteScriptFunction
   - GenerateImageFunction
   - SynthesizeSpeechFunction
2. Deploy heavy Lambda functions:
   - ComposeVideoFunction (Container Image)
   - UploadToYouTubeFunction (Container Image)
3. Deploy Step Functions
```bash
cdk deploy VideoGen-LambdaLight-dev --require-approval never
cdk deploy VideoGen-LambdaHeavy-dev --require-approval never
cdk deploy VideoGen-StepFunctions-dev --require-approval never
```

---

## 🧪 Testing Workflow
### Trigger Manually
```bash
aws stepfunctions start-execution \
  --state-machine-arn <STATE_MACHINE_ARN> \
  --input '{"source":"manual","stage":"dev"}'
```

### CloudWatch Logs
```bash
aws logs tail /aws/lambda/videogen-compose-video-dev --follow
aws logs tail /aws/lambda/videogen-upload-youtube-dev --follow
```

---

## 📦 Secret Naming Convention
- `videogen/openai-<stage>`
- `videogen/google-<stage>`
- `videogen/youtube-<stage>`

## 🧠 Notes for AI Agent
- Ensure unique resource names to avoid deployment conflicts.
- Always use ARM64 architecture for Lambda to reduce cost.
- Handle ECR image build and push using CDK DockerImageFunction.
- Follow error handling defined in Step Functions.
- Clean up temporary files in `/tmp` after each Lambda execution.

---

## ✅ Completion Criteria
- A YouTube video is automatically generated and uploaded based on Google Spreadsheet data.
- Step Functions state machine completes without error.
- All intermediate assets are stored and managed securely via S3 and Secrets Manager.

---

## 📍 File Location Suggestion
Place this file in the project root as:
```
/docs/AI_AGENT_INSTRUCTIONS.md
```

---

End of document.

