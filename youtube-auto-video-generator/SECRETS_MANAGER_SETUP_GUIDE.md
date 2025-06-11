# 🔐 AWS Secrets Manager 設定ガイド

## 概要
YouTube動画自動生成システムで使用するAPI キーと認証情報をAWS Secrets Managerに安全に保存します。

## 必要なSecret一覧

### 1. OpenAI API キー
- **Secret名**: `video-generator/openai-api-key-dev`
- **形式**: テキスト (文字列)
- **用途**: DALL-E画像生成、GPTスクリプト生成

### 2. Google認証情報
- **Secret名**: `video-generator/google-credentials-dev`
- **形式**: JSON
- **用途**: Google Sheets読み書き

### 3. YouTube認証情報
- **Secret名**: `video-generator/youtube-credentials-dev`
- **形式**: JSON
- **用途**: YouTube動画アップロード

---

## 🚀 設定手順

### 前提条件
- AWS CLIがインストール済み
- 適切なAWS認証情報が設定済み
- 必要なAPI キーを事前に取得済み

### 1. OpenAI API キーの設定

#### 1.1 OpenAI API キーの取得
1. [OpenAI Platform](https://platform.openai.com/api-keys)にアクセス
2. "Create new secret key"をクリック
3. API キーをコピー（一度しか表示されません）

#### 1.2 AWS Secrets Managerに保存
```bash
# コマンドライン経由で設定
aws secretsmanager create-secret \
    --name "video-generator/openai-api-key-dev" \
    --description "OpenAI API key for video generation" \
    --secret-string "sk-your-actual-openai-api-key-here" \
    --region ap-northeast-1
```

#### 1.3 AWS コンソール経由での設定
1. [AWS Secrets Manager Console](https://console.aws.amazon.com/secretsmanager/)にアクセス
2. "Store a new secret"をクリック
3. Secret type: "Other type of secret"を選択
4. Key/value pairs → "Plaintext"タブを選択
5. OpenAI API キーを直接貼り付け
6. Secret name: `video-generator/openai-api-key-dev`
7. "Store"をクリック

### 2. Google認証情報の設定

#### 2.1 Google Cloud Console での設定
1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトを選択または作成
3. "APIs & Services" > "Credentials"に移動
4. "Create Credentials" > "Service Account"を選択
5. サービスアカウント名を入力（例：`video-generator-service`）
6. 役割を設定：
   - Google Sheets API
   - Google Drive API（必要に応じて）
7. JSONキーをダウンロード

#### 2.2 Google Sheets API とDrive API の有効化
```bash
# Google Sheets API を有効化
gcloud services enable sheets.googleapis.com

# Google Drive API を有効化（必要に応じて）
gcloud services enable drive.googleapis.com
```

#### 2.3 AWS Secrets Managerに保存
```bash
# JSONファイルの内容をSecrets Managerに保存
aws secretsmanager create-secret \
    --name "video-generator/google-credentials-dev" \
    --description "Google service account credentials for Sheets API" \
    --secret-string file://path/to/your/service-account-key.json \
    --region ap-northeast-1
```

#### 2.4 JSONファイルの例
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service-account@your-project.iam.gserviceaccount.com",
  "client_id": "client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/service-account%40your-project.iam.gserviceaccount.com"
}
```

### 3. YouTube認証情報の設定

#### 3.1 YouTube Data API の設定
1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. "APIs & Services" > "Library"に移動
3. "YouTube Data API v3"を検索して有効化
4. "Credentials"に移動
5. "Create Credentials" > "OAuth 2.0 Client IDs"を選択
6. Application type: "Desktop application"
7. 認証情報をJSONでダウンロード

#### 3.2 OAuth 2.0 認証の設定
YouTube APIはOAuth 2.0認証が必要です。アクセストークンとリフレッシュトークンが必要になります。

```json
{
  "client_id": "your-client-id.googleusercontent.com",
  "client_secret": "your-client-secret",
  "refresh_token": "your-refresh-token",
  "access_token": "your-access-token"
}
```

#### 3.3 リフレッシュトークンの取得
```bash
# Google OAuth 2.0 Playground を使用
# https://developers.google.com/oauthplayground/
# 1. YouTube Data API v3 を選択
# 2. 認証フローを完了
# 3. refresh_token を取得
```

#### 3.4 AWS Secrets Managerに保存
```bash
aws secretsmanager create-secret \
    --name "video-generator/youtube-credentials-dev" \
    --description "YouTube API OAuth credentials" \
    --secret-string '{
        "client_id": "your-client-id.googleusercontent.com",
        "client_secret": "your-client-secret",
        "refresh_token": "your-refresh-token"
    }' \
    --region ap-northeast-1
```

---

## ✅ 設定確認

### 1. Secretの一覧確認
```bash
aws secretsmanager list-secrets \
    --filters Key=name,Values=video-generator \
    --region ap-northeast-1
```

### 2. 個別Secretの確認
```bash
# OpenAI API キー
aws secretsmanager get-secret-value \
    --secret-id "video-generator/openai-api-key-dev" \
    --region ap-northeast-1

# Google認証情報
aws secretsmanager get-secret-value \
    --secret-id "video-generator/google-credentials-dev" \
    --region ap-northeast-1

# YouTube認証情報
aws secretsmanager get-secret-value \
    --secret-id "video-generator/youtube-credentials-dev" \
    --region ap-northeast-1
```

### 3. Lambda関数での接続テスト
各Lambda関数を個別に実行してSecrets Managerからの認証情報取得をテストできます。

---

## 🔒 セキュリティのベストプラクティス

### 1. IAM権限の最小化
Lambda実行ロールは必要なSecretのみにアクセス権限を付与：
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "secretsmanager:GetSecretValue",
            "Resource": [
                "arn:aws:secretsmanager:ap-northeast-1:455931011903:secret:video-generator/*"
            ]
        }
    ]
}
```

### 2. Secret名前付け規則
- 環境ごとの分離: `-dev`, `-prod`サフィックス
- プロジェクト識別: `video-generator/`プレフィックス
- 用途の明確化: `openai-api-key`, `google-credentials`

### 3. ローテーション設定
定期的なAPI キーローテーションを設定：
```bash
aws secretsmanager update-secret \
    --secret-id "video-generator/openai-api-key-dev" \
    --secret-string "new-api-key-here"
```

### 4. 監査ログ
CloudTrailでSecrets Managerへのアクセスを監視

---

## 🚨 トラブルシューティング

### よくあるエラー

#### 1. "ResourceNotFoundException"
```
Secrets Managerでシークレットが見つからない
→ Secret名とリージョンを確認
```

#### 2. "AccessDeniedException"
```
Lambda実行ロールに適切なIAM権限がない
→ IAMポリシーを確認
```

#### 3. "InvalidRequestException"
```
Secret値のJSON形式が不正
→ JSON構文を検証
```

### デバッグコマンド
```bash
# Lambda関数のログ確認
aws logs filter-log-events \
    --log-group-name "/aws/lambda/video-generator-read-spreadsheet-dev" \
    --start-time 1735689600000

# IAM権限確認
aws iam get-role-policy \
    --role-name VideoGenerator-Lambda-Role-dev \
    --policy-name LambdaCustomPolicy
```

---

## 📞 サポート

問題が発生した場合：
1. CloudWatch Logsでエラー詳細を確認
2. IAM権限設定を検証
3. Secret値のJSON形式を確認
4. AWSサポートに問い合わせ

**設定完了後は、Lambda関数の個別テストを実行してください。**
