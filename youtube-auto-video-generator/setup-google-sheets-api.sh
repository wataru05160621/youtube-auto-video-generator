#!/bin/bash
# Google Sheets API認証情報をAWS Secrets Managerに設定するスクリプト

# 使用方法:
# ./setup-google-sheets-api.sh path/to/service-account.json

if [ $# -eq 0 ]; then
    echo "使用方法: $0 <service-account-json-file-path>"
    echo "例: $0 ./my-project-service-account.json"
    exit 1
fi

JSON_FILE="$1"
SECRET_NAME="youtube-auto-video-generator/google-sheets-api"
REGION="ap-northeast-1"

if [ ! -f "$JSON_FILE" ]; then
    echo "❌ ファイルが見つかりません: $JSON_FILE"
    exit 1
fi

echo "Google Sheets API認証情報をSecrets Managerに設定中..."

# JSONファイルの内容を読み込み
JSON_CONTENT=$(cat "$JSON_FILE")

# シークレットが存在するかチェック
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "既存のシークレットを更新中..."
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "$JSON_CONTENT" \
        --region "$REGION"
else
    echo "新しいシークレットを作成中..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Google Sheets API service account credentials for YouTube video generator" \
        --secret-string "$JSON_CONTENT" \
        --region "$REGION"
fi

echo "✅ Google Sheets API認証情報の設定が完了しました"
echo "シークレット名: $SECRET_NAME"
echo ""
echo "📋 次のステップ:"
echo "1. Google Sheetsでスプレッドシートを作成"
echo "2. サービスアカウントのメールアドレスにスプレッドシートの編集権限を付与"
echo "   サービスアカウントメール: $(echo "$JSON_CONTENT" | jq -r '.client_email')"
