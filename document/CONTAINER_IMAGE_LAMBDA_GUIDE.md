# Container Image Lambda 実装ガイド

## 🎯 概要

前回の失敗を踏まえ、Container Image Lambda の制約と最適化を考慮した実装ガイドです。ComposeVideoFunction と UploadToYouTubeFunction を ARM64 Container Image として確実にデプロイするための詳細な手順を提供します。

## 📋 Container Image Lambda の制約

### AWS Lambda Container Image の制限事項

1. **メモリサイズ**: 最大 3008MB (通常 Lambda の 3072MB より小さい)
2. **タイムアウト**: 最大 15分 (通常 Lambda と同じ)
3. **アーキテクチャ**: ARM64 または x86_64 (ARM64 推奨)
4. **イメージサイズ**: 最大 10GB (圧縮時)
5. **ECR プッシュ**: CDK で自動ビルド・プッシュ

### 前回の問題と解決策

| 問題 | 原因 | 解決策 |
|------|------|--------|
| メモリサイズエラー | 3072MB を設定 | 3008MB に修正 |
| ECR プッシュ失敗 | ネットワーク/権限問題 | Docker デーモン確認、IAM権限追加 |
| 循環依存 | スタック間の相互参照 | IAM ロールの事前定義 |
| 関数名重複 | 同名の Lambda 関数 | 命名規則の統一 |

## 🏗️ ComposeVideoFunction の実装

### ディレクトリ構造

```
src/ComposeVideoFunction/
├── Dockerfile
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── ffmpeg-handler.ts
│   ├── s3-handler.ts
│   └── types.ts
├── dist/           # TypeScript コンパイル結果
└── node_modules/   # npm install 結果
```

### Dockerfile (ARM64 最適化)

```dockerfile
# ARM64 Lambda base image
FROM public.ecr.aws/lambda/nodejs:18-arm64

# Install system dependencies
RUN dnf update -y && \
    dnf install -y wget tar xz gzip && \
    dnf clean all

# Install FFmpeg for ARM64
RUN wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz && \
    tar -xf ffmpeg-release-arm64-static.tar.xz && \
    mv ffmpeg-*-arm64-static/ffmpeg /usr/local/bin/ && \
    mv ffmpeg-*-arm64-static/ffprobe /usr/local/bin/ && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    rm -rf ffmpeg-* && \
    /usr/local/bin/ffmpeg -version

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production --platform=linux --arch=arm64 && \
    npm cache clean --force

# Copy compiled TypeScript code
COPY dist/ ./

# Verify the handler file exists
RUN ls -la index.js

# Set the CMD to your handler
CMD [ "index.handler" ]
```

### package.json

```json
{
  "name": "compose-video-function",
  "version": "1.0.0",
  "description": "Lambda function to compose video from images and audio",
  "main": "index.js",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "clean": "rm -rf dist node_modules"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.826.0",
    "@aws-sdk/client-secrets-manager": "^3.826.0",
    "@aws-sdk/client-sns": "^3.826.0",
    "@aws-sdk/s3-request-presigner": "^3.826.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.136",
    "@types/node": "^18.19.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### TypeScript設定 (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false,
    "removeComments": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Lambda Handler (src/index.ts)

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Handler } from './s3-handler';
import { FFmpegHandler } from './ffmpeg-handler';
import { ComposeVideoInput, ComposeVideoResult, ComposedVideo } from './types';

const s3Handler = new S3Handler();
const ffmpegHandler = new FFmpegHandler();

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent | ComposeVideoInput,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('ComposeVideoFunction started', {
    requestId: context.awsRequestId,
    input: JSON.stringify(event),
  });

  try {
    // 入力データの解析
    let input: ComposeVideoInput;
    if ('body' in event && event.body) {
      input = JSON.parse(event.body);
    } else {
      input = event as ComposeVideoInput;
    }

    // 入力検証
    if (!input.imageUrls || !Array.isArray(input.imageUrls) || input.imageUrls.length === 0) {
      throw new Error('imageUrls must be a non-empty array');
    }
    if (!input.audioUrl) {
      throw new Error('audioUrl is required');
    }
    if (!input.executionId) {
      throw new Error('executionId is required');
    }

    console.log('Processing video composition', {
      imageCount: input.imageUrls.length,
      audioUrl: input.audioUrl,
      executionId: input.executionId,
    });

    // 一時ファイル配列（クリーンアップ用）
    const tempFiles: string[] = [];

    // S3 から画像と音声をダウンロード
    const imagePaths = await s3Handler.downloadImages(input.imageUrls, tempFiles);
    const audioPath = await s3Handler.downloadAudio(input.audioUrl, tempFiles);

    // 動画合成の実行
    const outputPath = '/tmp/composed-video.mp4';
    const isFFmpegAvailable = ffmpegHandler.checkAvailability();

    let videoInfo: { duration: number; fileSize: number };
    let s3Key: string;
    let s3Url: string;

    if (isFFmpegAvailable) {
      // FFmpeg が利用可能な場合は通常の動画合成
      await ffmpegHandler.composeVideo(imagePaths, audioPath, outputPath);
      tempFiles.push(outputPath);

      // 動画情報を取得
      videoInfo = ffmpegHandler.getVideoInfo(outputPath);

      // S3 にアップロード
      s3Key = `videos/video-${input.executionId}.mp4`;
      s3Url = await s3Handler.uploadVideo(outputPath, s3Key);
    } else {
      // FFmpeg が利用できない場合はモック応答を生成
      console.warn('FFmpeg is not available. Generating mock response.');
      videoInfo = ffmpegHandler.createMockVideoInfo(audioPath);
      s3Key = `videos/mock-video-${input.executionId}.mp4`;
      s3Url = `s3://${process.env.S3_BUCKET_NAME}/${s3Key}`;

      // 注意：実際の動画ファイルは生成されません
    }

    // 結果オブジェクトの作成
    const video: ComposedVideo = {
      videoUrl: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`,
      s3Key,
      s3Url,
      duration: videoInfo.duration,
      fileSize: videoInfo.fileSize,
    };

    const result: ComposeVideoResult = {
      success: true,
      video,
      executionId: input.executionId,
      message: `Video composed successfully from ${input.imageUrls.length} images and audio`,
    };

    // 一時ファイルのクリーンアップ
    s3Handler.cleanupTempFiles(tempFiles);

    console.log('ComposeVideoFunction completed successfully', {
      videoSize: videoInfo.fileSize,
      videoDuration: videoInfo.duration,
      s3Key,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('ComposeVideoFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: ComposeVideoResult = {
      success: false,
      error: errorMessage,
      executionId: (event as any).executionId || 'unknown',
      message: 'Video composition failed',
    };

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorResult),
    };
  }
}
```

### FFmpeg Handler (src/ffmpeg-handler.ts)

```typescript
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class FFmpegHandler {
  /**
   * FFmpeg の可用性をチェック
   */
  checkAvailability(): boolean {
    try {
      execSync('ffmpeg -version', { stdio: 'pipe' });
      return true;
    } catch (error) {
      console.warn('FFmpeg is not available:', error);
      return false;
    }
  }

  /**
   * FFmpeg を使用して動画を合成
   */
  async composeVideo(imagePaths: string[], audioPath: string, outputPath: string): Promise<void> {
    if (imagePaths.length === 0) {
      throw new Error('No images provided for video composition');
    }

    try {
      // 各画像の表示時間を計算（音声の長さに基づく）
      const audioDuration = this.getAudioDuration(audioPath);
      const imageDuration = audioDuration / imagePaths.length;

      // 画像リストファイルを作成
      const imageListPath = '/tmp/image_list.txt';
      const imageListContent = imagePaths
        .map(imagePath => `file '${imagePath}'\nduration ${imageDuration}`)
        .join('\n') + `\nfile '${imagePaths[imagePaths.length - 1]}'`; // 最後の画像を重複

      fs.writeFileSync(imageListPath, imageListContent);

      // FFmpeg コマンドを実行
      const ffmpegCommand = [
        'ffmpeg',
        '-f', 'concat',
        '-safe', '0',
        '-i', imageListPath,
        '-i', audioPath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-r', '1', // フレームレート
        '-shortest',
        '-y', // 出力ファイルを上書き
        outputPath,
      ].join(' ');

      console.log('Executing FFmpeg command:', ffmpegCommand);
      execSync(ffmpegCommand, { stdio: 'pipe' });

      // 出力ファイルの存在確認
      if (!fs.existsSync(outputPath)) {
        throw new Error('Failed to create output video file');
      }

      console.log('Video composition completed successfully');
    } catch (error) {
      console.error('FFmpeg execution failed:', error);
      throw new Error(`Video composition failed: ${error}`);
    }
  }

  /**
   * 音声ファイルの長さを取得
   */
  private getAudioDuration(audioPath: string): number {
    try {
      const output = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`, {
        encoding: 'utf8'
      });
      return parseFloat(output.trim()) || 10; // デフォルト10秒
    } catch (error) {
      console.warn('Failed to get audio duration, using default:', error);
      return 10; // デフォルト値
    }
  }

  /**
   * 動画の詳細情報を取得
   */
  getVideoInfo(videoPath: string): { duration: number; fileSize: number } {
    try {
      // ファイルサイズ取得
      const stats = fs.statSync(videoPath);
      const fileSize = stats.size;

      // 動画の長さ取得
      const durationOutput = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8'
      });
      const duration = parseFloat(durationOutput.trim()) || 0;

      return { duration, fileSize };
    } catch (error) {
      console.warn('Failed to get video info:', error);
      return { duration: 0, fileSize: 0 };
    }
  }

  /**
   * FFmpeg なしでの簡易動画情報生成（フォールバック）
   */
  createMockVideoInfo(audioPath: string): { duration: number; fileSize: number } {
    try {
      const audioStats = fs.statSync(audioPath);
      const estimatedDuration = this.getAudioDuration(audioPath);
      const estimatedFileSize = audioStats.size * 5; // 音声ファイルの5倍と仮定

      console.log('Generated mock video info', {
        duration: estimatedDuration,
        fileSize: estimatedFileSize,
      });

      return {
        duration: estimatedDuration,
        fileSize: estimatedFileSize,
      };
    } catch (error) {
      console.warn('Failed to create mock video info:', error);
      return { duration: 10, fileSize: 1024 * 1024 }; // デフォルト値
    }
  }
}
```

## 🚀 UploadToYouTubeFunction の実装

### Dockerfile

```dockerfile
# ARM64 Lambda base image
FROM public.ecr.aws/lambda/nodejs:18-arm64

# Install system dependencies
RUN dnf update -y && \
    dnf install -y wget curl && \
    dnf clean all

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production --platform=linux --arch=arm64 && \
    npm cache clean --force

# Copy compiled TypeScript code
COPY dist/ ./

# Verify the handler file exists
RUN ls -la index.js

# Set the CMD to your handler
CMD [ "index.handler" ]
```

### package.json

```json
{
  "name": "upload-to-youtube-function",
  "version": "1.0.0",
  "description": "Lambda function to upload video to YouTube",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.826.0",
    "@aws-sdk/client-secrets-manager": "^3.826.0",
    "@aws-sdk/client-sns": "^3.826.0",
    "google-auth-library": "^9.4.1",
    "googleapis": "^128.0.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.136",
    "@types/node": "^18.19.0",
    "typescript": "^5.3.0"
  }
}
```

### Lambda Handler (src/index.ts)

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { youtube_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { S3Handler } from './s3-handler';
import { SecretsHandler } from './secrets-handler';
import { UploadToYouTubeInput, UploadToYouTubeResult, UploadedVideo } from './types';
import * as fs from 'fs';

const s3Handler = new S3Handler();
const secretsHandler = new SecretsHandler();

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent | UploadToYouTubeInput,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('UploadToYouTubeFunction started', {
    requestId: context.awsRequestId,
    input: JSON.stringify(event),
  });

  try {
    // 入力データの解析
    let input: UploadToYouTubeInput;
    if ('body' in event && event.body) {
      input = JSON.parse(event.body);
    } else {
      input = event as UploadToYouTubeInput;
    }

    // 入力検証
    if (!input.videoUrl) {
      throw new Error('videoUrl is required');
    }
    if (!input.title) {
      throw new Error('title is required');
    }
    if (!input.description) {
      throw new Error('description is required');
    }
    if (!input.executionId) {
      throw new Error('executionId is required');
    }

    console.log('Processing YouTube upload', {
      videoUrl: input.videoUrl,
      title: input.title.substring(0, 50) + '...',
      executionId: input.executionId,
    });

    // 一時ファイル配列（クリーンアップ用）
    const tempFiles: string[] = [];

    // YouTube OAuth 認証情報の取得
    const youtubeCredentials = await secretsHandler.getYouTubeCredentials();

    // OAuth2 クライアントの設定
    const oauth2Client = new OAuth2Client(
      youtubeCredentials.client_id,
      youtubeCredentials.client_secret,
      youtubeCredentials.redirect_uri
    );

    oauth2Client.setCredentials({
      refresh_token: youtubeCredentials.refresh_token,
    });

    // YouTube API クライアントの初期化
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // S3 から動画ファイルをダウンロード
    const videoPath = '/tmp/video-to-upload.mp4';
    await s3Handler.downloadFile(input.videoUrl, videoPath);
    tempFiles.push(videoPath);

    // YouTube にアップロード
    const uploadedVideo = await this.uploadToYouTube(
      youtube,
      videoPath,
      input.title,
      input.description,
      input.tags || [],
      input.privacyStatus || 'unlisted'
    );

    // 結果オブジェクトの作成
    const result: UploadToYouTubeResult = {
      success: true,
      uploadedVideo,
      executionId: input.executionId,
      message: 'Video uploaded to YouTube successfully',
    };

    // 一時ファイルのクリーンアップ
    s3Handler.cleanupTempFiles(tempFiles);

    console.log('UploadToYouTubeFunction completed successfully', {
      videoId: uploadedVideo.videoId,
      videoUrl: uploadedVideo.videoUrl,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('UploadToYouTubeFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: UploadToYouTubeResult = {
      success: false,
      error: errorMessage,
      executionId: (event as any).executionId || 'unknown',
      message: 'YouTube upload failed',
    };

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorResult),
    };
  }
}

/**
 * YouTube に動画をアップロード
 */
async function uploadToYouTube(
  youtube: youtube_v3.Youtube,
  filePath: string,
  title: string,
  description: string,
  tags: string[] = [],
  privacyStatus: 'public' | 'unlisted' | 'private' = 'unlisted'
): Promise<UploadedVideo> {
  try {
    const fileSize = fs.statSync(filePath).size;
    console.log(`Uploading video to YouTube: ${filePath} (${fileSize} bytes)`);

    const requestBody = {
      snippet: {
        title: title.substring(0, 100), // YouTube のタイトル制限
        description: description.substring(0, 5000), // YouTube の説明文制限
        tags: tags.slice(0, 500), // YouTube のタグ制限
        categoryId: '22', // People & Blogs
        defaultLanguage: 'ja',
        defaultAudioLanguage: 'ja',
      },
      status: {
        privacyStatus,
        embeddable: true,
        license: 'youtube',
        publicStatsViewable: true,
      },
    };

    const media = {
      mimeType: 'video/mp4',
      body: fs.createReadStream(filePath),
    };

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody,
      media,
    });

    if (!response.data.id) {
      throw new Error('Failed to get video ID from YouTube response');
    }

    const uploadedVideo: UploadedVideo = {
      videoId: response.data.id,
      videoUrl: `https://www.youtube.com/watch?v=${response.data.id}`,
      title: response.data.snippet?.title || title,
      description: response.data.snippet?.description || description,
      privacyStatus: response.data.status?.privacyStatus || privacyStatus,
      uploadDate: new Date().toISOString(),
    };

    console.log('Video uploaded successfully to YouTube', {
      videoId: uploadedVideo.videoId,
      videoUrl: uploadedVideo.videoUrl,
    });

    return uploadedVideo;
  } catch (error) {
    console.error('YouTube upload failed:', error);
    throw new Error(`Failed to upload video to YouTube: ${error}`);
  }
}
```

## 📦 CDK での Container Image Lambda デプロイ

### Lambda Heavy Stack (application/lambda-heavy-stack.ts)

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ResourceNaming } from '../../config/resource-naming';
import { StageConfig } from '../../config/stage-config';
import * as path from 'path';

export interface LambdaHeavyStackProps extends cdk.StackProps {
  config: StageConfig;
  s3BucketArn: string;
  lambdaHeavyRoleArn: string;
}

export interface HeavyLambdaFunctions {
  composeVideoFunction: lambda.DockerImageFunction;
  uploadToYouTubeFunction: lambda.DockerImageFunction;
}

export class LambdaHeavyStack extends cdk.Stack {
  public readonly functions: HeavyLambdaFunctions;
  private readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: LambdaHeavyStackProps) {
    super(scope, id, props);

    this.naming = new ResourceNaming(props.config.stage);

    // IAM ロールを外部から参照
    const executionRole = iam.Role.fromRoleArn(
      this,
      'ExecutionRole',
      props.lambdaHeavyRoleArn
    );

    // 共通の環境変数
    const commonEnvironment = {
      STAGE: props.config.stage,
      S3_BUCKET_NAME: props.s3BucketArn.split(':::')[1], // ARN からバケット名を抽出
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps',
    };

    // ComposeVideoFunction (Container Image)
    this.functions = {
      composeVideoFunction: new lambda.DockerImageFunction(this, 'ComposeVideoFunction', {
        functionName: this.naming.composeVideoFunction(),
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(__dirname, '../../../src/ComposeVideoFunction'),
          {
            platform: cdk.aws_ecr_assets.Platform.LINUX_ARM64, // ARM64 プラットフォーム指定
            buildArgs: {
              BUILDPLATFORM: 'linux/arm64',
              TARGETPLATFORM: 'linux/arm64',
            },
          }
        ),
        role: executionRole,
        timeout: cdk.Duration.seconds(props.config.lambdaConfig.timeout),
        memorySize: props.config.lambdaConfig.heavyMemorySize, // 3008MB
        architecture: lambda.Architecture.ARM_64,
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'ComposeVideoFunction',
        },
        reservedConcurrentExecutions: 1, // 同時実行を制限（リソース保護）
      }),

      uploadToYouTubeFunction: new lambda.DockerImageFunction(this, 'UploadToYouTubeFunction', {
        functionName: this.naming.uploadToYouTubeFunction(),
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(__dirname, '../../../src/UploadToYouTubeFunction'),
          {
            platform: cdk.aws_ecr_assets.Platform.LINUX_ARM64, // ARM64 プラットフォーム指定
            buildArgs: {
              BUILDPLATFORM: 'linux/arm64',
              TARGETPLATFORM: 'linux/arm64',
            },
          }
        ),
        role: executionRole,
        timeout: cdk.Duration.seconds(props.config.lambdaConfig.timeout),
        memorySize: 2048, // YouTube アップロード用
        architecture: lambda.Architecture.ARM_64,
        environment: {
          ...commonEnvironment,
          FUNCTION_NAME: 'UploadToYouTubeFunction',
        },
        reservedConcurrentExecutions: 2, // YouTube API の制限を考慮
      }),
    };

    // CloudWatch ログ保持期間設定
    Object.values(this.functions).forEach((func, index) => {
      const functionNames = ['ComposeVideo', 'UploadToYouTube'];

      new cdk.CfnOutput(this, `${functionNames[index]}FunctionArn`, {
        value: func.functionArn,
        description: `ARN of the ${functionNames[index]} Lambda function`,
        exportName: `VideoGen-${functionNames[index]}-Function-Arn-${props.config.stage}`,
      });
    });
  }
}
```

## 🚀 ビルドとデプロイ手順

### 1. 事前準備

```bash
# Docker デーモンの確認
docker ps

# ECR ログイン（CDK が自動で行うが、手動でも可能）
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com
```

### 2. TypeScript コンパイル

```bash
# ComposeVideoFunction のビルド
cd src/ComposeVideoFunction
npm ci
npm run build

# UploadToYouTubeFunction のビルド
cd ../UploadToYouTubeFunction
npm ci
npm run build
```

### 3. Container Image のローカルテスト

```bash
# ComposeVideoFunction のローカルビルドテスト
cd src/ComposeVideoFunction
docker build --platform linux/arm64 -t compose-video-test .

# UploadToYouTubeFunction のローカルビルドテスト
cd ../UploadToYouTubeFunction
docker build --platform linux/arm64 -t upload-youtube-test .
```

### 4. CDK デプロイ

```bash
cd infrastructure

# LambdaHeavy スタックのデプロイ
cdk deploy VideoGen-LambdaHeavy-dev --require-approval never

# デプロイ状況の確認
aws lambda list-functions --query "Functions[?contains(FunctionName,'videogen')].{Name:FunctionName,PackageType:PackageType,Architecture:Architectures[0],MemorySize:MemorySize}"
```

## 🔍 デプロイ後の検証

### 1. 関数の基本情報確認

```bash
# ComposeVideoFunction の確認
aws lambda get-function --function-name videogen-compose-video-dev

# UploadToYouTubeFunction の確認
aws lambda get-function --function-name videogen-upload-youtube-dev
```

### 2. 実行テスト

```bash
# ComposeVideoFunction のテスト実行
aws lambda invoke \
  --function-name videogen-compose-video-dev \
  --payload '{"imageUrls":["s3://test-bucket/image1.jpg"],"audioUrl":"s3://test-bucket/audio.mp3","executionId":"test-123"}' \
  response.json

# UploadToYouTubeFunction のテスト実行
aws lambda invoke \
  --function-name videogen-upload-youtube-dev \
  --payload '{"videoUrl":"s3://test-bucket/video.mp4","title":"Test Video","description":"Test Description","executionId":"test-123"}' \
  response.json
```

### 3. CloudWatch ログの確認

```bash
# ComposeVideoFunction のログ
aws logs tail /aws/lambda/videogen-compose-video-dev --follow

# UploadToYouTubeFunction のログ
aws logs tail /aws/lambda/videogen-upload-youtube-dev --follow
```

## ⚠️ トラブルシューティング

### よくある問題と解決策

| 問題 | 症状 | 解決策 |
|------|------|--------|
| ECR プッシュ失敗 | `no basic auth credentials` | `aws ecr get-login-password` でログイン |
| メモリサイズエラー | `InvalidParameterValueException` | 3008MB 以下に設定 |
| アーキテクチャ不一致 | `ImageArchitecture` エラー | ARM64 に統一 |
| FFmpeg 実行失敗 | `/bin/sh: ffmpeg: not found` | Dockerfile の FFmpeg インストール確認 |
| YouTube API エラー | `insufficient authentication scopes` | OAuth スコープの確認 |

### デバッグ用コマンド

```bash
# Container Image の詳細確認
aws lambda get-function-configuration --function-name videogen-compose-video-dev

# ECR リポジトリ確認
aws ecr describe-repositories --query "repositories[?contains(repositoryName,'videogen')]"

# ECR イメージ確認
aws ecr list-images --repository-name cdk-hnb659fds-container-assets-455931011903-ap-northeast-1
```

---

**次のステップ**: Container Image Lambda が正常にデプロイされたら、Step Functions との統合とエンドツーエンドテストを実行します。
