# YouTube自動動画生成システム 技術ガイド

## システムアーキテクチャ詳細

### 3層デプロイメント構造

#### Foundation Layer
```
S3 Stack:
├── videogen-assets-dev (画像・音声ファイル)
├── videogen-videos-dev (完成動画)
└── videogen-cdk-assets-dev (デプロイ用アセット)

IAM Stack:
├── Lambda実行ロール (各種AWS サービスアクセス権限)
├── Step Functions実行ロール (Lambda呼び出し権限)
└── EventBridge実行ロール (Step Functions起動権限)

Secrets Stack:
├── google-sheets-api (サービスアカウント認証情報)
├── openai-api-key (OpenAI API キー)
└── youtube-api (OAuth クライアント認証情報)
```

#### Infrastructure Layer
```
Layers Stack:
├── Common Layer (共通ユーティリティ)
├── Google APIs Layer (Google API クライアント)
└── FFmpeg Layer (動画処理バイナリ)

SNS Stack:
├── Video Processing Topic (処理状況通知)
└── Error Notification Topic (エラー通知)

Events Stack:
├── Custom EventBus (動画生成イベント)
├── Manual Trigger Rule (手動実行用)
└── Scheduled Rule (定期実行用 - 毎日10:00 JST)
```

#### Application Layer
```
Lambda Light Stack:
├── ReadSpreadsheetFunction (512MB, 5分)
├── GenerateScriptFunction (512MB, 5分)
├── WriteScriptFunction (512MB, 5分)
├── GenerateImageFunction (512MB, 10分)
└── SynthesizeSpeechFunction (512MB, 10分)

Lambda Heavy Stack:
├── ComposeVideoFunction (3008MB, 15分, Container Image)
└── UploadToYouTubeFunction (3008MB, 15分, Container Image)

Step Functions Stack:
└── VideoGenerationStateMachine (全ワークフロー管理)
```

## 詳細ワークフロー

### Step Functions定義
```json
{
  "Comment": "YouTube Video Generation Workflow",
  "StartAt": "ReadSpreadsheetTask",
  "States": {
    "ReadSpreadsheetTask": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Next": "GenerateScriptTask"
    },
    "GenerateScriptTask": {
      "Type": "Task", 
      "Resource": "arn:aws:states:::lambda:invoke",
      "Next": "TransformForWriteScript"
    },
    "TransformForWriteScript": {
      "Type": "Pass",
      "Parameters": {
        "videosWithScripts.$": "$.body.videosWithScripts",
        "spreadsheetId.$": "$.spreadsheetId"
      },
      "Next": "WriteScriptTask"
    },
    "WriteScriptTask": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke", 
      "Next": "TransformForParallel"
    },
    "TransformForParallel": {
      "Type": "Pass",
      "Parameters": {
        "processedVideos.$": "$.processedVideos"
      },
      "Next": "GenerateResourcesParallel"
    },
    "GenerateResourcesParallel": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "GenerateImageTask",
          "States": {
            "GenerateImageTask": {
              "Type": "Task",
              "Resource": "arn:aws:states:::lambda:invoke",
              "End": true
            }
          }
        },
        {
          "StartAt": "SynthesizeSpeechTask", 
          "States": {
            "SynthesizeSpeechTask": {
              "Type": "Task",
              "Resource": "arn:aws:states:::lambda:invoke",
              "End": true
            }
          }
        }
      ],
      "Next": "CombineParallelResults"
    },
    "CombineParallelResults": {
      "Type": "Pass",
      "Parameters": {
        "videosWithImages.$": "$[0].videosWithImages",
        "videosWithAudio.$": "$[1].videosWithAudio"
      },
      "Next": "ComposeVideoTask"
    },
    "ComposeVideoTask": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Next": "TransformForYouTube"
    },
    "TransformForYouTube": {
      "Type": "Pass", 
      "Parameters": {
        "composedVideos.$": "$.composedVideos"
      },
      "Next": "UploadToYouTubeTask"
    },
    "UploadToYouTubeTask": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Next": "VideoGenerationSuccess"
    },
    "VideoGenerationSuccess": {
      "Type": "Succeed"
    }
  }
}
```

## Lambda関数詳細

### ReadSpreadsheetFunction
```javascript
// 主要機能
- Google Sheets API経由でスプレッドシートデータ読み取り
- 列名の自動マッピング（日本語・英語対応）
- status='pending'の行をフィルタリング
- 1-based行インデックスで管理

// 入力
{
  "spreadsheetId": "スプレッドシートID",
  "range": "A1:Z100", 
  "sheetName": "Sheet1"
}

// 出力
{
  "statusCode": 200,
  "spreadsheetId": "...",
  "totalVideos": 3,
  "videosToProcess": [
    {
      "rowIndex": 2,
      "title": "AI基礎入門",
      "theme": "人工知能の基本概念", 
      "status": "pending"
    }
  ]
}
```

### GenerateScriptFunction
```javascript
// 主要機能  
- OpenAI GPT-3.5-turbo APIで台本生成
- 日本語での自然な台本作成
- APIエラー時のフォールバック機能
- 1-3分の動画向け台本長調整

// 入力
{
  "videosToProcess": [...]
}

// 出力
{
  "statusCode": 200,
  "body": {
    "videosWithScripts": [
      {
        "rowIndex": 2,
        "title": "AI基礎入門",
        "script": "生成された台本テキスト...",
        "status": "success"
      }
    ]
  }
}
```

### GenerateImageFunction
```javascript
// 主要機能
- OpenAI DALL-E 3 APIで画像生成
- 3種類の画像を生成（サムネイル、説明用、背景用）
- S3への自動アップロード
- APIエラー時のモック画像生成

// 生成画像種類
1. サムネイル用高品質画像
2. 動画内説明用イラスト
3. 背景用シンプル画像

// 出力
{
  "statusCode": 200,
  "videosWithImages": [
    {
      "rowIndex": 2,
      "imageGenerated": true,
      "images": [
        {
          "index": 1,
          "s3Url": "https://...",
          "prompt": "..."
        }
      ]
    }
  ]
}
```

### SynthesizeSpeechFunction  
```javascript
// 主要機能
- Amazon Pollyで日本語音声合成
- 音声：Takumi（男性、ニューラル音声）
- MP3形式でS3保存
- 推定再生時間計算（150語/分基準）

// 音声処理
- Markdownタグ除去
- 改行正規化  
- 自然な読み上げ用テキスト整形

// 出力
{
  "statusCode": 200,
  "videosWithAudio": [
    {
      "rowIndex": 2,
      "audioGenerated": true,
      "audioUrl": "https://...",
      "estimatedDurationSeconds": 125,
      "voice": "Takumi"
    }
  ]
}
```

### ComposeVideoFunction (Container Image)
```javascript
// 主要機能
- FFmpegによる動画合成
- 画像+音声→MP4動画生成
- ARM64アーキテクチャ最適化
- 1280x720 解像度、H.264エンコード

// FFmpegコマンド例
ffmpeg -y -loop 1 -i "image.png" -i "audio.mp3" \
  -c:v libx264 -tune stillimage -c:a aac -b:a 192k \
  -pix_fmt yuv420p -shortest -t 120 "output.mp4"

// 処理フロー
1. S3から画像・音声ダウンロード
2. FFmpegで動画合成
3. S3へ動画アップロード
4. 一時ファイル削除
```

### UploadToYouTubeFunction (Container Image)
```javascript
// 主要機能
- YouTube Data API v3で動画アップロード
- OAuth認証によるアクセス
- プライバシー設定：unlisted（限定公開）
- メタデータ自動設定

// アップロード設定
{
  "snippet": {
    "title": "動画タイトル",
    "description": "生成された説明文",
    "tags": ["キーワード1", "キーワード2"],
    "categoryId": "22", // People & Blogs
    "defaultLanguage": "ja"
  },
  "status": {
    "privacyStatus": "unlisted",
    "embeddable": true
  }
}
```

## データフロー詳細

### スプレッドシート ↔ システム連携
```
Google Sheets 列構成:
A: title (必須)
B: theme  
C: target_audience
D: duration
E: keywords
F: status (pending/processing/completed)
G: script (自動生成)
H: description (自動生成)
I: processed_at (自動更新)
```

### S3ストレージ構成
```
videogen-assets-dev/
├── images/
│   ├── {rowIndex}_1.png (サムネイル)
│   ├── {rowIndex}_2.png (説明用)
│   └── {rowIndex}_3.png (背景用)
└── audio/
    └── {rowIndex}_speech.mp3

videogen-videos-dev/
└── videos/
    └── composed_{rowIndex}_{timestamp}.mp4
```

### クロススタック連携
```typescript
// CloudFormation Export/Import パターン
export const bucketName = cdk.Fn.exportValue(
  this.naming.exportName("S3", "AssetsBucketName")
);

const bucketName = cdk.Fn.importValue(
  this.naming.exportName("S3", "AssetsBucketName")  
);
```

## セキュリティ設計

### IAM権限最小化
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::videogen-*/*"
    },
    {
      "Effect": "Allow", 
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:youtube-auto-video-generator/*"
    }
  ]
}
```

### シークレット管理
```
AWS Secrets Manager:
├── google-sheets-api (JSON サービスアカウントキー)
├── openai-api-key (API キー文字列)
└── youtube-api (OAuth クライアント認証情報)
```

## パフォーマンス最適化

### Lambda関数サイジング
```
軽量関数 (512MB):
- ReadSpreadsheet: I/O集約、API呼び出し主体
- GenerateScript: API待機時間が大部分
- WriteScript: 小さなデータ更新のみ

重量関数 (3008MB): 
- GenerateImage: 画像ダウンロード・S3アップロード
- SynthesizeSpeech: 音声処理・エンコード
- ComposeVideo: FFmpeg動画処理（CPU/メモリ集約）
- UploadToYouTube: 大容量動画アップロード
```

### 並列処理最適化
```
Step Functions Parallel:
├── GenerateImageTask    } 同時実行で
└── SynthesizeSpeechTask } 処理時間短縮
```

### Container Image最適化
```dockerfile
FROM public.ecr.aws/lambda/nodejs:20-arm64

# Multi-stage buildでサイズ削減
COPY package*.json ./
RUN npm ci --only=production

# FFmpeg最新版インストール
RUN yum install -y ffmpeg

COPY index.js ./
CMD ["index.handler"]
```

## 監視・ログ設計

### CloudWatch メトリクス
```
カスタムメトリクス:
- VideoGeneration/Success (成功数)
- VideoGeneration/Failure (失敗数) 
- VideoGeneration/Duration (処理時間)
- VideoGeneration/Cost (推定コスト)
```

### ログ集約
```
CloudWatch Logs Groups:
├── /aws/lambda/videogen-readspreadsheet-dev
├── /aws/lambda/videogen-generatescript-dev  
├── /aws/lambda/videogen-generateimage-dev
├── /aws/lambda/videogen-synthesizespeech-dev
├── /aws/lambda/videogen-composevideo-dev
├── /aws/lambda/videogen-uploadtoyoutube-dev
└── /aws/stepfunctions/VideoGen-VideoGeneration-dev
```

### アラート設定
```
CloudWatch Alarms:
- Lambda エラー率 > 5%
- Step Functions 失敗率 > 10%  
- S3 ストレージ使用量 > 1GB
- 月間API呼び出し数 > 1000回
```

## 開発・運用ガイドライン

### ローカル開発
```bash
# Lambda関数テスト
cd src/lambda-light/ReadSpreadsheetFunction
npm install
node -e "
const handler = require('./index').handler;
handler({spreadsheetId: 'test'}).then(console.log);
"

# CDK デプロイ
cd infrastructure  
npm run build
cdk diff      # 変更内容確認
cdk deploy    # デプロイ実行
```

### CI/CD パイプライン
```yaml
# GitHub Actions例
name: Deploy
on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build  
      - run: npm test
      - run: cdk deploy --require-approval never
```

### 本番運用チェックリスト
- [ ] 全API認証情報の有効性確認
- [ ] CloudWatch アラーム設定
- [ ] S3バケットのバックアップ設定
- [ ] Lambda関数のDead Letter Queue設定
- [ ] コスト制限アラームの設定
- [ ] セキュリティグループ・NACLの確認
- [ ] データ保持期間ポリシーの設定

---

このシステムは AWS Well-Architected Framework に基づいて設計されており、セキュリティ、信頼性、パフォーマンス効率性、コスト最適化、運用上の優秀性の5つの柱を考慮しています。