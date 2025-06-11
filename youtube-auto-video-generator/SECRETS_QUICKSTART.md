# 🚀 AWS Secrets Manager - クイックスタートガイド

## 最速セットアップ（5分で完了）

### 前提条件
- AWS CLIがインストール済み
- 適切なAWS認証情報が設定済み
- 必要なAPI キーを取得済み

### ステップ1: 必要なAPI キーを準備

#### 1.1 OpenAI API キー
- [OpenAI Platform](https://platform.openai.com/api-keys)でAPI キーを作成
- `sk-`で始まる文字列をコピー

#### 1.2 Google Service Account
- [Google Cloud Console](https://console.cloud.google.com/)でプロジェクト作成
- Google Sheets API を有効化
- Service Account作成してJSONキーをダウンロード

#### 1.3 YouTube OAuth認証
- [Google Cloud Console](https://console.cloud.google.com/)でYouTube Data API v3を有効化
- OAuth 2.0 Client IDを作成
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)でrefresh_tokenを取得

### ステップ2: 自動セットアップスクリプト実行

```bash
# リポジトリのルートディレクトリで実行
cd /Users/shinzato/programing/create_movie/youtube-auto-video-generator

# セットアップスクリプト実行
./scripts/setup-secrets.sh
```

スクリプトが順番に必要な情報を聞いてくるので、準備したAPI キーを入力してください。

### ステップ3: 設定確認

```bash
# 設定確認スクリプト実行
./scripts/test-secrets.sh
```

すべて✓が表示されれば設定完了です。

---

## 🛠️ 手動設定（詳細制御が必要な場合）

### OpenAI API キー設定
```bash
aws secretsmanager create-secret \
    --name "video-generator/openai-api-key-dev" \
    --description "OpenAI API key for video generation" \
    --secret-string "sk-your-actual-openai-api-key-here" \
    --region ap-northeast-1
```

### Google認証情報設定
```bash
aws secretsmanager create-secret \
    --name "video-generator/google-credentials-dev" \
    --description "Google service account credentials for Sheets API" \
    --secret-string file://path/to/service-account-key.json \
    --region ap-northeast-1
```

### YouTube認証情報設定
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

## ✅ 次のステップ

設定が完了したら：

1. **Lambda関数の個別テスト**
   ```bash
   # 各Lambda関数をAWSコンソールで手動実行
   ```

2. **Step Functions ワークフロー全体のテスト**
   ```bash
   # Step Functions コンソールで実行開始
   ```

3. **エラーが発生した場合**
   - CloudWatch Logsを確認
   - `./scripts/test-secrets.sh`で設定を再確認

---

## 🔗 関連ドキュメント

- [詳細設定ガイド](./SECRETS_MANAGER_SETUP_GUIDE.md)
- [デプロイ完了レポート](./DEPLOYMENT_COMPLETE_REPORT.md)
- [AWS権限一覧](./AWS_PERMISSIONS_REQUIRED.md)
