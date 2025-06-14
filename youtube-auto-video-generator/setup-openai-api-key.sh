#!/bin/bash
# OpenAI APIキーをAWS Secrets Managerに設定するスクリプト

# 使用方法:
# ./setup-openai-api-key.sh "your-openai-api-key-here"

if [ $# -eq 0 ]; then
    echo "使用方法: $0 <OpenAI-API-Key>"
    echo "例: $0 sk-proj-xxxxxxxxxxxxxxxxxxxx"
    exit 1
fi

OPENAI_API_KEY="$1"
SECRET_NAME="youtube-auto-video-generator/openai-api-key"
REGION="ap-northeast-1"

echo "OpenAI APIキーをSecrets Managerに設定中..."

# シークレットが存在するかチェック
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "既存のシークレットを更新中..."
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "{\"apiKey\":\"$OPENAI_API_KEY\"}" \
        --region "$REGION"
else
    echo "新しいシークレットを作成中..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "OpenAI API key for YouTube video generator" \
        --secret-string "{\"apiKey\":\"$OPENAI_API_KEY\"}" \
        --region "$REGION"
fi

echo "✅ OpenAI APIキーの設定が完了しました"
echo "シークレット名: $SECRET_NAME"
