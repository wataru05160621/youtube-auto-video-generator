# YouTube自動動画生成システム - デプロイ後設定ガイド

## 概要
AWS CDKデプロイが完了した後に必要な設定手順です。

## 1. AWS Secrets Managerでの認証情報設定

### OpenAI API キー
```bash
aws secretsmanager create-secret \
  --name "video-generator/openai-api-key-dev" \
  --description "OpenAI API key for video generation" \
  --secret-string "YOUR_OPENAI_API_KEY"
```

### Google認証情報（Google Sheets API用）
```bash
# Google Cloud Consoleからダウンロードしたservice-account.jsonの内容を設定
aws secretsmanager create-secret \
  --name "video-generator/google-credentials-dev" \
  --description "Google service account credentials for Sheets API" \
  --secret-string file://path/to/service-account.json
```

### YouTube API認証情報
```bash
# YouTube APIのクライアントシークレット（OAuth2）
aws secretsmanager create-secret \
  --name "video-generator/youtube-credentials-dev" \
  --description "YouTube API OAuth2 credentials" \
  --secret-string '{
    "client_id": "YOUR_YOUTUBE_CLIENT_ID",
    "client_secret": "YOUR_YOUTUBE_CLIENT_SECRET",
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }'
```

## 2. Google Sheets設定

### スプレッドシート構造
| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| 企画名 | 企画内容 | 処理状況 | 動画URL |

### サンプルデータ
```
企画名：「AIの未来について」
企画内容：「2024年のAI技術トレンドと今後5年間の予測について詳しく解説」
処理状況：「未処理」
動画URL：（空欄）
```

## 3. Lambda関数のテスト

### 1. ReadSpreadsheetFunction
```bash
aws lambda invoke \
  --function-name video-generator-read-spreadsheet-dev \
  --payload '{"spreadsheetId": "YOUR_SPREADSHEET_ID"}' \
  response.json
```

### 2. GenerateScriptFunction
```bash
aws lambda invoke \
  --function-name video-generator-generate-script-dev \
  --payload '{"topic": "AIの未来", "content": "AI技術の進歩について"}' \
  response.json
```

## 4. Step Functions の手動実行

### EventBridge経由での手動実行
```bash
aws events put-events \
  --entries '[{
    "Source": "video-generator.manual",
    "DetailType": "Manual Trigger",
    "Detail": "{\"spreadsheetId\": \"YOUR_SPREADSHEET_ID\", \"stage\": \"dev\"}"
  }]'
```

### Step Functions コンソールでの直接実行
```json
{
  "spreadsheetId": "YOUR_SPREADSHEET_ID",
  "source": "manual-test",
  "stage": "dev"
}
```

## 5. 監視とログ

### CloudWatch Logsでの確認
- `/aws/lambda/video-generator-*` - Lambda関数のログ
- `/aws/stepfunctions/video-generator-dev` - Step Functionsの実行ログ

### SNS通知設定（オプション）
```bash
# メール通知の設定
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-1:455931011903:video-generator-notifications-dev \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## 6. スケジュール実行の確認

### EventBridge ルールの状態確認
```bash
aws events describe-rule \
  --name video-generator-schedule-dev
```

### ルールの有効化/無効化
```bash
# 無効化
aws events disable-rule --name video-generator-schedule-dev

# 有効化
aws events enable-rule --name video-generator-schedule-dev
```

## 7. トラブルシューティング

### よくある問題
1. **権限エラー** - IAMロールの権限を確認
2. **API制限** - OpenAI/YouTube APIのクォータを確認
3. **タイムアウト** - Lambda関数のタイムアウト設定を調整

### ログの確認方法
```bash
# 最新のログを表示
aws logs tail /aws/lambda/video-generator-read-spreadsheet-dev --follow

# エラーログのフィルタリング
aws logs filter-log-events \
  --log-group-name /aws/lambda/video-generator-read-spreadsheet-dev \
  --filter-pattern "ERROR"
```

## 8. セキュリティ設定

### S3バケットの暗号化確認
```bash
aws s3api get-bucket-encryption \
  --bucket video-generator-assets-dev-XXXXX
```

### IAMロールの権限監査
```bash
aws iam get-role-policy \
  --role-name VideoGenerator-Lambda-Role-dev \
  --policy-name LambdaCustomPolicy
```

## 完了チェックリスト

- [ ] AWS Secrets Managerに全ての認証情報を設定
- [ ] Google Sheetsにサンプルデータを追加
- [ ] 各Lambda関数の個別テストが成功
- [ ] Step Functionsの手動実行が成功
- [ ] SNS通知の設定（オプション）
- [ ] EventBridgeスケジューラーの動作確認
- [ ] CloudWatchでのログ監視設定
- [ ] セキュリティ設定の確認

## 次のステップ

1. 本格運用開始前にテストデータでの完全なワークフロー実行
2. 本番データでの試行
3. 監視アラートの設定
4. バックアップ・災害復旧計画の策定
