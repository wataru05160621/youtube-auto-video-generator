#!/bin/bash
# 全API設定の確認とテストスクリプト

REGION="ap-northeast-1"

echo "🔍 API設定確認とテストスクリプト"
echo "=================================="

# OpenAI API設定確認
echo ""
echo "1. 🤖 OpenAI API設定確認"
echo "------------------------"
if aws secretsmanager describe-secret --secret-id "youtube-auto-video-generator/openai-api-key" --region "$REGION" >/dev/null 2>&1; then
    echo "✅ OpenAI APIキーが設定されています"
    echo "   シークレット名: youtube-auto-video-generator/openai-api-key"
else
    echo "❌ OpenAI APIキーが設定されていません"
    echo "   設定方法: ./setup-openai-api-key.sh \"your-api-key\""
fi

# Google Sheets API設定確認
echo ""
echo "2. 📊 Google Sheets API設定確認"
echo "--------------------------------"
if aws secretsmanager describe-secret --secret-id "youtube-auto-video-generator/google-sheets-api" --region "$REGION" >/dev/null 2>&1; then
    echo "✅ Google Sheets API認証情報が設定されています"
    echo "   シークレット名: youtube-auto-video-generator/google-sheets-api"

    # サービスアカウントメールアドレスを表示
    SERVICE_ACCOUNT_EMAIL=$(aws secretsmanager get-secret-value --secret-id "youtube-auto-video-generator/google-sheets-api" --region "$REGION" --query "SecretString" --output text | jq -r '.client_email')
    echo "   サービスアカウント: $SERVICE_ACCOUNT_EMAIL"
else
    echo "❌ Google Sheets API認証情報が設定されていません"
    echo "   設定方法: ./setup-google-sheets-api.sh path/to/service-account.json"
fi

# YouTube API設定確認
echo ""
echo "3. 📺 YouTube API設定確認"
echo "-------------------------"
if aws secretsmanager describe-secret --secret-id "youtube-auto-video-generator/youtube-api" --region "$REGION" >/dev/null 2>&1; then
    echo "✅ YouTube API認証情報が設定されています"
    echo "   シークレット名: youtube-auto-video-generator/youtube-api"
else
    echo "❌ YouTube API認証情報が設定されていません"
    echo "   設定方法: ./setup-youtube-api.sh \"client_id\" \"client_secret\""
fi

# Lambda関数の状態確認
echo ""
echo "4. 🔧 Lambda関数状態確認"
echo "------------------------"
LAMBDA_FUNCTIONS=(
    "videogen-readspreadsheet-dev"
    "videogen-generatescript-dev"
    "videogen-writescript-dev"
    "videogen-generateimage-dev"
    "videogen-synthesizespeech-dev"
    "videogen-composevideo-dev"
    "videogen-uploadtoyoutube-dev"
)

for func in "${LAMBDA_FUNCTIONS[@]}"; do
    if aws lambda get-function --function-name "$func" >/dev/null 2>&1; then
        STATE=$(aws lambda get-function --function-name "$func" --query "Configuration.State" --output text)
        echo "✅ $func: $STATE"
    else
        echo "❌ $func: 関数が見つかりません"
    fi
done

# S3バケット確認
echo ""
echo "5. 🗄️ S3バケット確認"
echo "-------------------"
if aws s3 ls s3://videogen-assets-dev >/dev/null 2>&1; then
    echo "✅ S3バケット 'videogen-assets-dev' が利用可能です"
else
    echo "❌ S3バケット 'videogen-assets-dev' にアクセスできません"
fi

echo ""
echo "🎯 次のステップ"
echo "=================="
echo "1. 不足している設定を上記のスクリプトで設定してください"
echo "2. 設定完了後、統合テストを実行: python3 test-integration.py"
echo "3. Step Functions ワークフローをテスト実行"

echo ""
echo "📚 設定ガイド"
echo "============="
echo "OpenAI API:     https://platform.openai.com/api-keys"
echo "Google Sheets:  https://console.cloud.google.com/apis/credentials"
echo "YouTube API:    https://console.cloud.google.com/apis/credentials"
