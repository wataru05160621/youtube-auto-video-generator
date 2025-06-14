#!/bin/bash
# YouTube API認証情報をAWS Secrets Managerに設定するスクリプト

# 使用方法:
# ./setup-youtube-api.sh "client_id" "client_secret"

if [ $# -ne 2 ]; then
    echo "使用方法: $0 <client_id> <client_secret>"
    echo "例: $0 \"123456789-xxxx.apps.googleusercontent.com\" \"GOCSPX-xxxxxxxxxxxxxxxx\""
    exit 1
fi

CLIENT_ID="$1"
CLIENT_SECRET="$2"
SECRET_NAME="youtube-auto-video-generator/youtube-api"
REGION="ap-northeast-1"

echo "YouTube API認証情報をSecrets Managerに設定中..."

# JSON形式で認証情報を作成
JSON_CONTENT="{\"client_id\":\"$CLIENT_ID\",\"client_secret\":\"$CLIENT_SECRET\"}"

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
        --description "YouTube API OAuth credentials for YouTube video generator" \
        --secret-string "$JSON_CONTENT" \
        --region "$REGION"
fi

echo "✅ YouTube API認証情報の設定が完了しました"
echo "シークレット名: $SECRET_NAME"
echo ""
echo "📋 次のステップ:"
echo "1. YouTubeチャンネルでOAuth認証を実行"
echo "2. リフレッシュトークンを取得してSecrets Managerに追加"
