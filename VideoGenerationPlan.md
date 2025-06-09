# YouTube 自動動画生成プロジェクト 設計・実装計画

このドキュメントは、GitHub Copilot のエージェント機能を活用して自動で実行できるように、AWS ネイティブ構成を用いた YouTube 自動動画生成パイプラインの設計・実装計画をまとめたものです。

---

## 1. 目的と概要

- **目的**: Google スプレッドシートで管理された未処理行をトリガーとして、OpenAI API を使って台本／タイトル／説明文を生成し、OpenAI Image API（DALL·E）で静止画を生成、Amazon Polly で音声を合成、FFmpeg（または MediaConvert）で動画を編集・結合して最終的に YouTube にアップロードするワークフローを、AWS のサーバレスサービスのみで構築する。
- **運用方式**: GitHub リポジトリ上でコードとインフラ定義を管理し、GitHub Copilot エージェントを使って自動ビルド・デプロイ・実行を行う。

---

## 2. 用語・前提

1. **AWS アカウント**: Administrator 権限もしくは最小権限ポリシーを付与されたアカウント
2. **GCP プロジェクト**: Google Sheets API と YouTube Data API を有効化済み。OAuth クライアント／サービスアカウントを用意済み。
3. **OpenAI API キー**: ChatCompletion（台本生成）および DALL·E（画像生成）を利用可能な API キーを Secrets Manager に保管済み。
4. **GitHub Copilot エージェント**: GitHub リポジトリ内に配置したワークフローやコードを、Copilot のエージェントが自動で実行・テスト・デプロイできるように設定する。
5. **リージョン**: 東京（`ap-northeast-1`）を想定。
6. **タイムゾーン**: JST (UTC+9)。EventBridge のスケジュールは UTC 指定のため注意。

---

## 3. 全体アーキテクチャ

```mermaid
flowchart LR
    A[EventBridge: 定期スケジュール] -->|1| B[Step Functions: ワークフロー開始]
    B -->|2.1| C[Lambda①: ReadSpreadsheetFunction]
    C -->|2.2| D[Google Sheets API: プロンプト・メタ情報取得]
    B -->|3.1| E[Lambda②: GenerateScriptFunction]
    E -->|3.2| C  <!-- シナリオやタイトル・説明文を一時出力 -->
    C -->|4.1| F[Lambda③: WriteScriptFunction]
    B -->|5.1| G[Lambda④: GenerateImageFunction]
    G -->|5.2| H[S3: 画像保存]
    B -->|6.1| I[Lambda⑤: SynthesizeSpeechFunction]
    I -->|6.2| J[S3: 音声ファイル保存]
    B -->|7.1| K[Lambda⑥: ComposeVideoFunction]
    K -->|7.2| L[S3: 最終動画保存 (MP4)]
    B -->|8.1| M[Lambda⑦: UploadToYouTubeFunction]
    M -->|8.2| N[Google Sheets API: ステータス & 動画 URL 更新]
    M -->|9| O[SNS/Slack 通知 (オプション)]
```

- **EventBridge**: 毎日 JST 4:00 (UTC 19:00) に Step Functions のステートマシン起動をトリガー。
- **Step Functions**: 各ステップ（Lambda① ～ ⑦）を順次実行し、成功／失敗を管理。
- **Lambda① (ReadSpreadsheetFunction)**: Google Sheets API を使って「status 列が空白」の最上位行を取得。
- **Lambda② (GenerateScriptFunction)**: OpenAI ChatCompletion で台本／タイトル案／説明文を生成。
- **Lambda③ (WriteScriptFunction)**: 生成結果をシートに書き戻し、ステータスを `Processing` に更新。
- **Lambda④ (GenerateImageFunction)**: OpenAI Image API (DALL·E) で静止画を生成し、S3 に保存。
- **Lambda⑤ (SynthesizeSpeechFunction)**: Amazon Polly で台本テキストを音声合成し、S3 に保存。
- **Lambda⑥ (ComposeVideoFunction)**: 画像＋音声を FFmpeg（Lambda Layer） or MediaConvert で結合し、MP4 を生成して S3 に保存。
- **Lambda⑦ (UploadToYouTubeFunction)**: S3 上の動画ファイルをダウンロードし、YouTube Data API でアップロード。アップロードした URL とステータスをシートに書き戻す。 (オプションで SNS 通知も実装可)

---

## 4. リソース一覧とフォルダ構成

```
youtube-auto-video-generator/
├── infrastructure/                         # インフラコード (CDK)
│   ├── cdk.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── bin/
│   │   └── deploy.ts                       # CDK アプリケーションのエントリポイント
│   └── lib/
│       ├── iam-stack.ts                    # IAM ロール・ポリシー定義
│       ├── s3-stack.ts                     # S3 バケット定義
│       ├── lambda-stack.ts                 # Lambda 関数定義
│       ├── stepfunctions-stack.ts          # Step Functions, EventBridge 定義
│       └── sns-stack.ts (オプション)         # SNS トピック定義
│       └── layers/
│           └── ffmpeg-layer/               # FFmpeg バイナリを含む Lambda Layer (バンドル済み)
├── src/                                    # 各 Lambda 関数のソースコード
│   ├── ReadSpreadsheetFunction/
│   │   ├── index.ts                        # ハンドラー
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── GenerateScriptFunction/
│   │   ├── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── WriteScriptFunction/
│   │   ├── index.ts
│   │   └── package.json
│   ├── GenerateImageFunction/
│   │   ├── index.ts
│   │   └── package.json
│   ├── SynthesizeSpeechFunction/
│   │   ├── index.ts
│   │   └── package.json
│   ├── ComposeVideoFunction/
│   │   ├── index.ts
│   │   ├── Dockerfile (オプション: コンテナデプロイ)
│   │   └── package.json
│   └── UploadToYouTubeFunction/
│       ├── index.ts
│       └── package.json
├── .github/
│   └── workflows/
│       └── deploy.yml                      # GitHub Actions (CDK デプロイ, テスト実行)
├── README.md                               # プロジェクト概要とセットアップ手順
└── LICENSE
```

### 4.1 主な AWS リソース

| リソース名                     | 種別               | 用途・説明                                                                                                      |
| ------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `video-generation-asset`       | S3 バケット        | 生成した静止画、音声ファイル、最終 MP4 動画を格納。LifeCycle ルールで古いファイルを自動削除する設定。           |
| `video-gen-secrets`            | Secrets Manager    | Google OAuth クライアント / シークレット、OpenAI API キー、YouTube OAuth トークン・リフレッシュトークンを格納。 |
| `lambda-role-video-gen`        | IAM ロール         | Lambda 関数が実行時に利用する IAM ロール。最小権限ポリシーを付与（下記 IAM 設計参照）。                         |
| `ReadSpreadsheetFunction`      | Lambda 関数        | Google Sheets から未処理行を読み取り。                                                                          |
| `GenerateScriptFunction`       | Lambda 関数        | OpenAI Chat API で台本／タイトル／説明文を生成。                                                                |
| `WriteScriptFunction`          | Lambda 関数        | 生成結果を Google Sheets に書き戻し、ステータス更新。                                                           |
| `GenerateImageFunction`        | Lambda 関数        | OpenAI Image API (DALL·E) で静止画生成 → S3 保存。                                                              |
| `SynthesizeSpeechFunction`     | Lambda 関数        | Amazon Polly で台本テキストを音声合成 → S3 保存。                                                               |
| `ComposeVideoFunction`         | Lambda 関数        | FFmpeg (Lambda Layer) or MediaConvert で動画結合 → S3 保存。                                                    |
| `UploadToYouTubeFunction`      | Lambda 関数        | YouTube Data API で動画をアップロード → シート更新。                                                            |
| `VideoGenerationStateMachine`  | Step Functions     | 各 Lambda をワークフローとして順次実行。リトライポリシーや分岐ロジックを設定。                                  |
| `DailyTriggerRule`             | EventBridge ルール | 毎日 JST 4:00 に Step Functions ステートマシンを起動するルール。                                                |
| `VideoGenerationNotifications` | SNS トピック       | 動画生成完了や異常検知時に Slack などへ通知 (オプション実装)。                                                  |

---

## 5. IAM 設計 (最小限の権限例)

```yaml
# IAM Role: lambda-role-video-gen
AssumeRolePolicyDocument:
  Version: "2012-10-17"
  Statement:
    - Effect: Allow
      Principal:
        Service:
          - lambda.amazonaws.com
      Action:
        - sts:AssumeRole

Policies:
  - PolicyName: LambdaBasicExecution
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - logs:CreateLogGroup
            - logs:CreateLogStream
            - logs:PutLogEvents
          Resource: arn:aws:logs:*:*:*

  - PolicyName: S3ReadWritePolicy
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - s3:PutObject
            - s3:GetObject
            - s3:DeleteObject
          Resource: arn:aws:s3:::video-generation-asset/*

  - PolicyName: SecretsManagerReadPolicy
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - secretsmanager:GetSecretValue
          Resource: arn:aws:secretsmanager:<リージョン>:<アカウントID>:secret:video-gen-secrets-*

  - PolicyName: StepFunctionsStartExecutionPolicy
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - states:StartExecution
          Resource: arn:aws:states:<リージョン>:<アカウントID>:stateMachine:VideoGenerationStateMachine

  - PolicyName: PollySynthesizeSpeechPolicy
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - polly:SynthesizeSpeech
          Resource: "*"

  - PolicyName: MediaConvertAccessPolicy
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - mediaconvert:CreateJob
            - mediaconvert:GetJob
            - mediaconvert:ListQueues
          Resource: "*"

  - PolicyName: StepFunctionsInvokePolicy
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - states:DescribeExecution
            - states:GetActivityTask
            - states:GetExecutionHistory
          Resource: arn:aws:states:<リージョン>:<アカウントID>:stateMachine:VideoGenerationStateMachine

  # （必要に応じて CloudWatch Logs や SNS への publish 権限を追加）
```

- **ポイント**: Google Sheets API や YouTube Data API を呼ぶ Lambda 関数自体は外部 API 呼び出しのみのため、AWS 内の権限は不要。ただし SecretsManager から認証情報を取得するため `secretsmanager:GetSecretValue` が必要。

---

## 6. Lambda 関数仕様詳細

### 6.1 ReadSpreadsheetFunction (`src/ReadSpreadsheetFunction/index.ts`)

- **機能**: Google Sheets API を使って「status 列が空白」の最上位行を 1 行取得する。
- **環境変数**:

  - `SHEET_ID`: スプレッドシートの ID
  - `SECRETS_NAME`: `video-gen-secrets`

- **Secrets Manager**:

  - `google_client_id`
  - `google_client_secret`
  - `google_refresh_token`

- **処理フロー**:

  1. Secrets Manager から Google OAuth 情報を取得
  2. `googleapis` ライブラリで OAuth2 クライアント生成 → アクセストークン取得
  3. Sheets API (`spreadsheets.values.get`) で `Sheet1!A2:E100` 範囲を取得
  4. `status` 列が空白 (例：A4) の最上位行を検出し、`rowIndex: 4, prompt: B4` を次ステップへ渡す
  5. 未処理行がなければ `{ status: "NoData" }` を返し、Step Functions を終了

- **戻り値**:

  ```jsonc
  {
    "rowIndex": 4,
    "prompt": "動画化キーワード",
    "meta": { "(必要に応じて他の列)": "..." }
  }
  ```

---

### 6.2 GenerateScriptFunction (`src/GenerateScriptFunction/index.ts`)

- **機能**: OpenAI Chat API を呼び出し、台本（script）、タイトル案 (titles\[]), 説明文 (description) を生成する。
- **入力**:

  ```jsonc
  { "rowIndex": 4, "prompt": "動画化キーワード" }
  ```

- **環境変数**:

  - `OPENAI_API_KEY` (Secrets Manager 経由で取得)

- **処理フロー**:

  1. Secrets Manager から `OPENAI_API_KEY` を取得
  2. `openai` SDK で ChatCompletion を呼び出し

     - 例プロンプト:

       ```text
       system: "あなたは YouTube 動画のシナリオライターです。"
       user: "以下のキーワードから、視聴者が興味を持ちやすいタイトルを3つ提案し、さらに1分程度の台本と説明文を生成してください。
       キーワード: 動画化キーワード"
       ```

  3. レスポンスから `titles` (配列), `description`, `script` を抽出
  4. 以下 JSON を返却

     ```jsonc
     {
       "rowIndex": 4,
       "titles": ["タイトル1", "タイトル2", "タイトル3"],
       "description": "生成された説明文",
       "script": "生成された台本テキスト"
     }
     ```

- **戻り値**:

  ```jsonc
  {
    "rowIndex": 4,
    "titles": ["タイトル1", "タイトル2", "タイトル3"],
    "description": "生成された説明文",
    "script": "生成された台本テキスト"
  }
  ```

---

### 6.3 WriteScriptFunction (`src/WriteScriptFunction/index.ts`)

- **機能**: 生成結果を Google Sheets に書き戻し、ステータスを `Processing` に更新。
- **入力**:

  ```jsonc
  {
    "rowIndex": 4,
    "titles": ["タイトル1", "タイトル2", "タイトル3"],
    "description": "生成された説明文",
    "script": "生成された台本テキスト"
  }
  ```

- **環境変数**:

  - `SHEET_ID`, `SECRETS_NAME`

- **処理フロー**:

  1. Secrets Manager から Google OAuth 情報を取得
  2. Sheets API (`spreadsheets.values.update`) を用いて以下を更新:

     - `title` 列 (C4) に `titles[0]` をセット
     - `description` 列 (D4) に `description` をセット
     - `script` 列 (E4) に `script` をセット
     - `status` 列 (A4) に `Processing` をセット

  3. 以下 JSON を返却し、次ステップへ渡す:

     ```jsonc
     {
       "rowIndex": 4,
       "prompt": "動画化キーワード",
       "title": "タイトル1",
       "description": "生成された説明文",
       "script": "生成された台本テキスト"
     }
     ```

- **戻り値**:

  ```jsonc
  {
    "rowIndex": 4,
    "prompt": "動画化キーワード",
    "title": "タイトル1",
    "description": "生成された説明文",
    "script": "生成された台本テキスト"
  }
  ```

---

### 6.4 GenerateImageFunction (`src/GenerateImageFunction/index.ts`)

- **機能**: OpenAI Image API (DALL·E) を使って静止画 (3 ～ 5 枚) を生成し、S3 に保存。
- **入力**:

  ```jsonc
  {
    "rowIndex": 4,
    "title": "タイトル1",
    "script": "生成された台本テキスト"
  }
  ```

- **環境変数**:

  - `OPENAI_API_KEY`, `S3_BUCKET_NAME`

- **処理フロー**:

  1. Secrets Manager から `OPENAI_API_KEY` を取得
  2. `NUM_IMAGES = 3` を定義し、ループで `openai.images.generate` を呼び出し:

     - `prompt`: `"<タイトル1> の内容をイメージした YouTube サムネイル風イラスト"`
     - `n = 1`, `size = "512x512"`

  3. レスポンスから取得した画像バイナリを `/tmp/image{i}.png` に保存 → S3(`/images/video-4-{i}.png`) にアップロード
  4. `imageUrls` 配列に S3 オブジェクト URI を格納して返却:

     ```jsonc
     {
       "rowIndex": 4,
       "imageUrls": [
         "s3://video-generation-asset/images/video-4-1.png",
         "s3://video-generation-asset/images/video-4-2.png",
         "s3://video-generation-asset/images/video-4-3.png"
       ],
       "title": "タイトル1",
       "script": "生成された台本テキスト"
     }
     ```

- **戻り値**:

  ```jsonc
  {
    "rowIndex": 4,
    "imageUrls": [
      "s3://video-generation-asset/images/video-4-1.png",
      "s3://video-generation-asset/images/video-4-2.png",
      "s3://video-generation-asset/images/video-4-3.png"
    ],
    "title": "タイトル1",
    "script": "生成された台本テキスト"
  }
  ```

---

### 6.5 SynthesizeSpeechFunction (`src/SynthesizeSpeechFunction/index.ts`)

- **機能**: Amazon Polly を使って、台本テキストを音声合成し、S3 に保存。
- **入力**:

  ```jsonc
  {
    "rowIndex": 4,
    "imageUrls": [ "s3://…/video-4-1.png", … ],
    "script": "生成された台本テキスト",
    "title": "タイトル1"
  }
  ```

- **環境変数**:

  - `AWS_REGION`, `S3_BUCKET_NAME`

- **処理フロー**:

  1. `aws-sdk` の `Polly` クライアントを初期化
  2. `polly.synthesizeSpeech` を呼び出し:

     - `Text`: `script` を渡す (長文の場合はチャンク分割)
     - `VoiceId`: `Takumi` (日本語)
     - `OutputFormat`: `mp3`

  3. レスポンスの音声バイナリを `/tmp/speech.mp3` に保存 → S3(`/audio/video-4.mp3`) にアップロード
  4. 以下を返却:

     ```jsonc
     {
       "rowIndex": 4,
       "imageUrls": [ "s3://video-generation-asset/images/video-4-1.png", … ],
       "audioUrl": "s3://video-generation-asset/audio/video-4.mp3",
       "title": "タイトル1",
       "script": "生成された台本テキスト"
     }
     ```

- **戻り値**:

  ```jsonc
  {
    "rowIndex": 4,
    "imageUrls": [ "s3://…/video-4-1.png", … ],
    "audioUrl": "s3://video-generation-asset/audio/video-4.mp3",
    "title": "タイトル1",
    "script": "生成された台本テキスト"
  }
  ```

---

### 6.6 ComposeVideoFunction (`src/ComposeVideoFunction/index.ts`)

- **機能**: 画像＋音声を結合して MP4 動画を生成し、S3 に保存。
- **入力**:

  ```jsonc
  {
    "rowIndex": 4,
    "imageUrls": [
      "s3://…/video-4-1.png",
      "s3://…/video-4-2.png",
      "s3://…/video-4-3.png"
    ],
    "audioUrl": "s3://…/audio/video-4.mp3",
    "title": "タイトル1"
  }
  ```

#### 6.6.1 実装パターン 1: Lambda + FFmpeg (Lambda Layer)

- **事前準備**: Lambda Layer に最小限コーデックのみを含む静的ビルド版 FFmpeg バイナリを配置。
- **環境変数**:

  - `S3_BUCKET_NAME`

- **処理フロー**:

  1. S3 から全ての `imageUrls` と `audioUrl` を `/tmp/` にダウンロード
  2. FFmpeg コマンド例:

     ```bash
     /opt/ffmpeg -y \
       -loop 1 -t 5 -i /tmp/video-4-1.png \
       -loop 1 -t 5 -i /tmp/video-4-2.png \
       -loop 1 -t 5 -i /tmp/video-4-3.png \
       -i /tmp/speech.mp3 \
       -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]" \
       -map "[v]" -map 3:a -shortest /tmp/output-4.mp4
     ```

  3. `/tmp/output-4.mp4` を S3 にアップロード (`/videos/video-4.mp4`)
  4. 以下を返却:

     ```jsonc
     {
       "rowIndex": 4,
       "videoUrl": "s3://video-generation-asset/videos/video-4.mp4",
       "title": "タイトル1"
     }
     ```

- **注意点**:

  - Lambda ストレージ `/tmp` は 512MB まで。素材サイズと生成動画サイズに注意。
  - Lambda タイムアウト (900 秒まで) を超えないように、動画秒数や枚数を調整。

#### 6.6.2 実装パターン 2: AWS Elemental MediaConvert

- **事前準備**: メディア変換用 IAM ロール (MediaConvert 用) を作成し、S3 読み書き権限を付与。Job Template をコンソールで作成しておく。
- **環境変数**:

  - `S3_BUCKET_NAME`
  - `MEDIA_CONVERT_ROLE_ARN`
  - `MEDIACONVERT_ENDPOINT_URL` (必要な場合)

- **処理フロー**:

  1. Lambda で MediaConvert クライアントを初期化
  2. `CreateJob` API 呼び出し:

     - `Inputs`:

       - `ImageInserter` + `AudioSelectors` を使い、S3 にある画像と音声を組み合わせる設定を記述

     - `OutputGroups`: MP4 / 720p / H.264 を指定
     - `Role`: `MEDIA_CONVERT_ROLE_ARN`

  3. ジョブ作成後、SNS 通知または Step Functions ポーリングでジョブ完了を検知
  4. 完了レスポンスから出力 S3 パスを取得 → 以下を返却:

     ```jsonc
     {
       "rowIndex": 4,
       "videoUrl": "s3://video-generation-asset/videos/video-4.mp4",
       "title": "タイトル1"
     }
     ```

---

### 6.7 UploadToYouTubeFunction (`src/UploadToYouTubeFunction/index.ts`)

- **機能**: S3 の MP4 動画をダウンロードして YouTube にアップロードし、ステータス・URL をシートに書き戻す。 (オプションで SNS 通知)
- **入力**:

  ```jsonc
  {
    "rowIndex": 4,
    "videoUrl": "s3://video-generation-asset/videos/video-4.mp4",
    "title": "タイトル1",
    "description": "生成された説明文"
  }
  ```

- **環境変数**:

  - `S3_BUCKET_NAME`
  - `SHEET_ID`
  - `SECRETS_NAME`

- **Secrets Manager**:

  - `youtube_client_id`
  - `youtube_client_secret`
  - `youtube_refresh_token`

- **処理フロー**:

  1. Secrets Manager から YouTube OAuth 情報を取得
  2. S3 から `video-4.mp4` を `/tmp/video-4.mp4` にダウンロード
  3. `googleapis` の OAuth2 クライアントでアクセストークンを取得 → YouTube Data API の `videos.insert` を呼び出し:

     - `part`: `snippet,status`
     - `snippet.title`: `title`
     - `snippet.description`: `description`
     - `status.privacyStatus`: `public` (または `unlisted`)
     - `media.body`: `fs.createReadStream('/tmp/video-4.mp4')`

  4. レスポンスから `videoId` を取得 → `videoUrl` を `https://youtu.be/{videoId}` で組み立て
  5. Sheets API (`spreadsheets.values.update`) で該当行 (`rowIndex=4`) の:

     - `videoUrl` 列に `https://youtu.be/{videoId}` をセット
     - `status` 列に `Done` をセット

  6. Optional: SNS トピックに通知を Publish → Slack 連携など

- **戻り値**:

  ```jsonc
  {
    "status": "Succeeded",
    "videoId": "abcdEFGhIJK",
    "videoUrl": "https://youtu.be/abcdEFGhIJK"
  }
  ```

---

## 7. Step Functions 定義 (Express Workflow)

```jsonc
{
  "Comment": "YouTube 自動動画生成ワークフロー",
  "StartAt": "ReadSpreadsheet",
  "States": {
    "ReadSpreadsheet": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:<リージョン>:<アカウントID>:function:ReadSpreadsheetFunction",
      "Next": "GenerateScript",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3
        }
      ]
    },
    "GenerateScript": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:<リージョン>:<アカウントID>:function:GenerateScriptFunction",
      "Next": "WriteScriptToSheet",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3
        }
      ]
    },
    "WriteScriptToSheet": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:<リージョン>:<アカウントID>:function:WriteScriptFunction",
      "Next": "GenerateImage",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3
        }
      ]
    },
    "GenerateImage": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:<リージョン>:<アカウントID>:function:GenerateImageFunction",
      "Next": "SynthesizeSpeech",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3
        }
      ]
    },
    "SynthesizeSpeech": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:<リージョン>:<アカウントID>:function:SynthesizeSpeechFunction",
      "Next": "ComposeVideo",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3
        }
      ]
    },
    "ComposeVideo": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:<リージョン>:<アカウントID>:function:ComposeVideoFunction",
      "Next": "UploadToYouTube",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 2,
          "MaxAttempts": 2
        }
      ]
    },
    "UploadToYouTube": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:<リージョン>:<アカウントID>:function:UploadToYouTubeFunction",
      "End": true,
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 5,
          "MaxAttempts": 2
        }
      ]
    }
  }
}
```

- **リトライポリシー**: 各ステップに一時エラー対策として 2 ～ 3 回のリトライを設定。
- **Express Workflow**: 月 1,000,000 ステート遷移まで無料枠対象。

---

## 8. EventBridge ルール設定

- **スケジュール例 (CDK TypeScript)**:

  ```ts
  import * as events from "aws-cdk-lib/aws-events";
  import * as targets from "aws-cdk-lib/aws-events-targets";
  import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";

  // 例: 毎日 JST 4:00 → UTC 19:00
  const dailyRule = new events.Rule(this, "DailyTriggerRule", {
    schedule: events.Schedule.cron({ minute: "0", hour: "19" }),
  });
  dailyRule.addTarget(new targets.SfnStateMachine(videoGenStateMachine));
  ```

- **注意点**: 祝日や週末に実行しない場合は、EventBridge のカレンダー機能か、Step Functions 内に条件分岐を追加。

---

## 9. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` のサンプル:

```yaml
name: CI/CD

on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Deploy with AWS CDK
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18.x"

      - name: Install dependencies (CDK)
        working-directory: ./infrastructure
        run: npm ci

      - name: Build CDK
        working-directory: ./infrastructure
        run: npm run build

      - name: CDK Bootstrap
        working-directory: ./infrastructure
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: "ap-northeast-1"
        run: npx cdk bootstrap

      - name: CDK Deploy
        working-directory: ./infrastructure
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: "ap-northeast-1"
        run: npx cdk deploy --all --require-approval never

      - name: Notify Slack (optional)
        if: success()
        uses: slackapi/slack-github-action@v1.23.0
        with:
          payload: '{"text":"デプロイが完了しました。"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

- **ポイント**:

  - AWS 認証情報は GitHub Secrets に `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` を登録。
  - CDK コマンド (`bootstrap`, `deploy`) を実行する。
  - 必要に応じて Slack へ通知。

---

## 10. テスト計画

### 10.1 ユニットテスト

- **目的**: 各 Lambda 関数ロジックの動作をローカルで検証。
- **テストフレームワーク**: Jest を推奨。
- **モック**:

  - AWS SDK (Polly, S3, MediaConvert など) → `aws-sdk-mock` もしくは `jest.mock('aws-sdk')`
  - OpenAI SDK → プロンプトに対するレスポンスをモック
  - Google Sheets API → `googleapis` のモック
  - YouTube Data API → `googleapis` のモック

- **例**:

  ```ts
  import { handler } from "../src/GenerateScriptFunction";

  test("GenerateScriptFunction returns valid JSON", async () => {
    // 環境変数や OpenAI レスポンスをモック化
    process.env.OPENAI_API_KEY = "test-key";
    // openai を jest.mock で置き換え、固定レスポンスを返す
    const event = { rowIndex: 4, prompt: "動画化キーワード" };
    const result = await handler(event as any);
    expect(result).toHaveProperty("script");
    expect(Array.isArray(result.titles)).toBe(true);
  });
  ```

### 10.2 統合テスト (ステージング環境)

- **目的**: AWS 環境にデプロイ後、実際にフロー全体を実行し、正しく動作することを検証。
- **手順**:

  1. テスト用 Google スプレッドシートにダミーデータ (status=空, prompt=テスト) を行追加
  2. EventBridge -> Step Functions を手動トリガー
  3. Lambda ログ (CloudWatch Logs) を確認し、各ステップの処理が成功しているかを検証
  4. S3 に画像・音声・動画が保存されているか確認
  5. YouTube (ステージング用チャンネル) に指定の動画がアップロードされ、ステータスと URL がシートに更新されているかを確認

### 10.3 E2E テスト (本番環境のミラー)

- **目的**: 本番用とは別リージョン / アカウントにミラー環境を用意し、実際の運用と同じフローを試験的に実行。
- **手順**:

  1. ミラー環境に同一構成（S3, Lambda, Step Functions, EventBridge, Secrets Manager, Google Sheets, YouTube）をデプロイ
  2. 本番環境と同じテストデータをステージングシートに入れてフローを実行
  3. ミラー環境での挙動を検証し、本番移行時のリスクを低減

---

## 11. モニタリング・アラート設計

1. **CloudWatch Logs & Metrics**:

   - 各 Lambda のエラーレート・実行時間を Dashboard に表示
   - エラー数が閾値を超えた場合、SNS 経由でメール/SNS 通知

2. **Step Functions**:

   - "Failed Executions" アラートを設定し、失敗時に SNS 通知
   - ステートマシンの実行数・成功率を可視化

3. **S3 ストレージ監査**:

   - バケットサイズが一定値 (例: 10GB) を超えたらアラート送信
   - 古いアセットのライフサイクルルールで自動削除を設定

4. **Cost Explorer / Budgets**:

   - 月間予算 (例: \$50) を設定し、超過時にメール通知
   - Bedrock / OpenAI / S3 / MediaConvert のコストを定期レポート

5. **OAuth トークン失効監視**:

   - YouTube API のリフレッシュトークンエラーをキャッチして SNS 通知
   - Token 再発行手順をドキュメント化

6. **Google Sheets API レート制限監視**:

   - レスポンスに `429` エラーが含まれた場合、SNS で通知し、スロットル対策を検討

---

## 12. 実装スケジュール (GitHub Copilot エージェント向け)

以下は、Copilot エージェントが自動で実行すべきタスクを時系列で並べたものです。各ステップを完了すると次のステップに進む。

1. **環境準備** (Day1–2)

   - [ ] GitHub リポジトリ `youtube-auto-video-generator` 作成
   - [ ] `infrastructure/` フォルダに CDK プロジェクト (`cdk init app --language typescript`) を初期化
   - [ ] `src/` フォルダに必要な Lambda ディレクトリを作成
   - [ ] GitHub Secrets に以下を登録:

     - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (デプロイ用)
     - `SLACK_WEBHOOK_URL` (任意)
     - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
     - `OPENAI_API_KEY`
     - `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`

2. **インフラコード実装 (iam-stack.ts, s3-stack.ts)** (Day3–4)

   - Copilot: `iam-stack.ts` に `lambda-role-video-gen` を作成するコードを追加
   - Copilot: `s3-stack.ts` に `video-generation-asset` バケットを定義し、ライフサイクルルールを設定
   - コードをコミット & プッシュ

3. **CDK デプロイ (ベース構築)** (Day5)

   - Copilot: `cdk bootstrap` → `cdk deploy --all --require-approval never`
   - 生成されたリソース (IAM, S3) を AWS コンソールで確認

4. **Lambda①: ReadSpreadsheetFunction 実装** (Day6–7)

   - Copilot: `src/ReadSpreadsheetFunction/index.ts` に以下を実装:

     1. Secrets Manager から Google OAuth 情報取得
     2. `googleapis` を使って Sheets API 呼び出し
     3. 未処理行を検出して返却

   - `package.json` に `googleapis` を追加
   - `tsconfig.json` を配置
   - Copilot: Jest テスト (モック化) を追加
   - コミット & プッシュ → GitHub Actions がデプロイ & テスト実行

5. **Lambda②: GenerateScriptFunction 実装** (Day8–9)

   - Copilot: `src/GenerateScriptFunction/index.ts` に以下を実装:

     1. Secrets Manager から `OPENAI_API_KEY` 取得
     2. `openai` SDK で ChatCompletion 呼び出し
     3. レスポンスパースして返却

   - `package.json` に `openai` を追加
   - Jest ユニットテストを追加
   - コミット & プッシュ → CI がデプロイ & テスト実行

6. **Lambda③: WriteScriptFunction 実装** (Day10–11)

   - Copilot: `src/WriteScriptFunction/index.ts` に以下を実装:

     1. Secrets Manager から Google OAuth 情報取得
     2. Sheets API で台本・タイトル・説明文・ステータス更新
     3. 次ステップへの JSON を返却

   - `package.json` を更新して依存関係を管理
   - Jest ユニットテストを追加
   - コミット & プッシュ → CI がデプロイ & テスト実行

7. **Lambda④: GenerateImageFunction 実装** (Day12–13)

   - Copilot: `src/GenerateImageFunction/index.ts` に以下を実装:

     1. Secrets Manager から `OPENAI_API_KEY` 取得
     2. `openai.images.generate` をループで呼び出す
     3. 取得した画像バイナリを `/tmp` に保存 → S3 にアップロード
     4. `imageUrls` 配列を返却

   - `package.json` に `openai` を追加 (既存)
   - Jest テストを追加 (モック)
   - コミット & プッシュ → CI がデプロイ & テスト実行

8. **Lambda⑤: SynthesizeSpeechFunction 実装** (Day14–15)

   - Copilot: `src/SynthesizeSpeechFunction/index.ts` に以下を実装:

     1. `aws-sdk` の `Polly` クライアントで `synthesizeSpeech` 呼び出し
     2. `/tmp/speech.mp3` に保存 → S3 にアップロード
     3. `audioUrl` を返却

   - `package.json` を更新 (必要な場合)
   - Jest テストを追加 (Polly をモック)
   - コミット & プッシュ → CI がデプロイ & テスト実行

9. **Lambda⑥: ComposeVideoFunction 実装** (Day16–17)

   - Copilot: `src/ComposeVideoFunction/index.ts` に以下を実装 (FFmpeg 模式):

     1. S3 から `imageUrls` と `audioUrl` を `/tmp` にダウンロード
     2. `/opt/ffmpeg` コマンドで動画結合
     3. `/tmp/output.mp4` → S3 `/videos/video-<rowIndex>.mp4`
     4. `videoUrl` を返却

   - FFmpeg Lambda Layer を設定

   - Jest テスト (ファイル操作をモック)

   - コミット & プッシュ → CI がデプロイ & テスト実行

   - **注**: Lambda 容量制限を超えそうな場合、Copilot: MediaConvert パターンに切り替え。Job Template を作成し、`CreateJob` のロジックを実装。

10. **Lambda⑦: UploadToYouTubeFunction 実装** (Day18–19)

    - Copilot: `src/UploadToYouTubeFunction/index.ts` に以下を実装:

      1. Secrets Manager から YouTube OAuth 情報取得
      2. S3 から `/tmp/video.mp4` ダウンロード
      3. `googleapis` の OAuth2 クライアントでアクセストークン取得 → `youtube.videos.insert` 呼び出し
      4. レスポンスから `videoId` 抽出 → `videoUrl` 組み立て
      5. Sheets API で `videoUrl` / `status=Done` を更新
      6. SNS トピックに通知 (オプション)

    - `package.json` に `googleapis` を追加
    - Jest テストを追加 (YouTube API をモック)
    - コミット & プッシュ → CI がデプロイ & テスト実行

11. **Step Functions 定義 & CDK コード実装** (Day20)

    - Copilot: `infrastructure/lib/stepfunctions-stack.ts` に以下を実装:

      - Step Functions ステートマシン定義 (上記 JSON) を `Task` で Lambda 関数を呼び出す
      - 各ステップにリトライポリシーを設定
      - EventBridge Rule を `DailyTriggerRule` として定義し、ステートマシンをターゲットに追加

    - コミット & プッシュ → CI がデプロイ & 動作確認

12. **EventBridge 動作確認 & 統合テスト** (Day21)

    - Copilot: AWS CLI を使って EventBridge ルールを手動トリガー (`aws events test-event-pattern` 相当)
    - CloudWatch Logs を確認し、全 Lambda が順次実行されることを検証
    - S3 に画像 / 音声 / 動画がアップロードされ、Google Sheets に正しく書き込まれることを確認

13. **モニタリング・アラート設定** (Day22–23)

    - Copilot: CloudWatch アラートを定義:

      - Lambda エラー率が 5% を超えたら SNS 通知
      - Step Functions "FailedExecutions" アラート設定
      - S3 バケットサイズが 10GB を超えたら通知

    - Copilot: Budgets を設定し、月間予算（\$50）を超えたら通知

14. **本番移行 & ドキュメント整備** (Day24–25)

    - Copilot: README.md に各種設定手順、OAuth トークン再設定手順を追記
    - Copilot: テスト用スプレッドシートから本番用スプレッドシートへ切り替え
    - Copilot: Secrets Manager のステージングから本番へ環境変数値をコピー
    - Copilot: 最終確認を行い、本番用 Lambda 関数にタグ付け・バージョニングを有効化
    - コミット & プッシュ → CI が本番デプロイ

15. **事後レビュー & 改善** (Day26–28)

    - Copilot: Cost Explorer を確認し、実際のコストを分析
    - Copilot: 必要に応じて、動画秒数・解像度を調整してコスト削減
    - Copilot: FFmpeg から MediaConvert への切り替えを検討（Lambda の実行エラーが発生した場合）
    - Copilot: Emergent Bug 対応のための緊急パッチブランチを運用

---

## 13. 便利なコマンド・Tips

- **CDK コマンド**:

  ```bash
  # CDK 初期化 (一度きり)
  cdk init app --language typescript

  # 依存パッケージの追加例
  npm install @aws-cdk/aws-lambda @aws-cdk/aws-s3 @aws-cdk/aws-secretsmanager @aws-cdk/aws-iam @aws-cdk/aws-stepfunctions @aws-cdk/aws-stepfunctions-tasks @aws-cdk/aws-events @aws-cdk/aws-events-targets @aws-cdk/aws-sns

  # デプロイ (確認なし)
  cdk deploy --all --require-approval never

  # 巻き戻し (スタック名を指定して削除)
  cdk destroy MyStackName
  ```

- **Local Lambda テスト**:

  ```bash
  # ノード環境で直接ハンドラーを実行 (モック環境変数を設定)
  AWS_REGION=ap-northeast-1 \
  SHEET_ID=yourSheetId \
  SECRETS_NAME=video-gen-secrets \
  node -e "require('./src/ReadSpreadsheetFunction/index').handler({ rowIndex:4, prompt:'テスト' }, null)"
  ```

- **EventBridge テスト**:

  ```bash
  aws events put-rule --name TestRule --schedule-expression "cron(0 0 1 * ? *)"
  aws events put-targets --rule TestRule --targets "Id"="1","Arn"="arn:aws:states:ap-northeast-1:<account-id>:stateMachine:VideoGenerationStateMachine"
  aws events disable-rule --name TestRule
  aws events enable-rule --name TestRule
  ```

- **IAM ポリシーシュミレーション**:

  ```bash
  aws iam simulate-custom-policy --policy-input-list file://policy.json --action-names "polly:SynthesizeSpeech"
  ```

---

## 14. 参考情報

- AWS CDK (TypeScript) ドキュメント: [https://docs.aws.amazon.com/cdk/v2/guide/home.html](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- AWS Step Functions ドキュメント: [https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html)
- AWS Lambda + FFmpeg デプロイガイド: [https://aws.amazon.com/jp/blogs/news/bringing-ffmpeg-to-aws-lambda/](https://aws.amazon.com/jp/blogs/news/bringing-ffmpeg-to-aws-lambda/)
- Google Sheets API リファレンス: [https://developers.google.com/sheets/api](https://developers.google.com/sheets/api)
- OpenAI API ドキュメント: [https://platform.openai.com/docs](https://platform.openai.com/docs)
- YouTube Data API ドキュメント: [https://developers.google.com/youtube/v3](https://developers.google.com/youtube/v3)
- AWS Elemental MediaConvert ドキュメント: [https://docs.aws.amazon.com/mediaconvert/latest/ug/what-is.html](https://docs.aws.amazon.com/mediaconvert/latest/ug/what-is.html)

---

以上が、GitHub Copilot のエージェント機能で自動実行しやすいようにまとめた、YouTube 自動動画生成パイプラインの設計・実装計画です。必要に応じて、各タスクやコマンドは Copilot のスクリプトとして登録し、自動実行を設定してください。
