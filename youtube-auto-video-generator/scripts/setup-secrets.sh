#!/bin/bash

# YouTube動画自動生成システム - Secrets Manager 設定スクリプト
# Usage: ./setup-secrets.sh

set -e

# 設定値
REGION="ap-northeast-1"
STAGE="dev"
PROJECT_PREFIX="video-generator"

# 色付きログ
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# AWS CLI の確認
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI がインストールされていません"
        exit 1
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS認証が設定されていません"
        exit 1
    fi

    log_success "AWS CLI の設定が確認できました"
}

# Secret が既に存在するかチェック
check_secret_exists() {
    local secret_name=$1
    if aws secretsmanager describe-secret --secret-id "$secret_name" --region "$REGION" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# OpenAI API キーの設定
setup_openai_secret() {
    local secret_name="${PROJECT_PREFIX}/openai-api-key-${STAGE}"

    log_info "OpenAI API キーの設定を開始します..."

    if check_secret_exists "$secret_name"; then
        log_warning "Secret '$secret_name' は既に存在します"
        read -p "上書きしますか? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "OpenAI API キーの設定をスキップします"
            return
        fi
    fi

    echo "OpenAI API キーを入力してください (sk-で始まる文字列):"
    read -s openai_key

    if [[ ! $openai_key =~ ^sk- ]]; then
        log_error "無効なOpenAI API キー形式です"
        return 1
    fi

    if check_secret_exists "$secret_name"; then
        aws secretsmanager update-secret \
            --secret-id "$secret_name" \
            --secret-string "$openai_key" \
            --region "$REGION"
        log_success "OpenAI API キーを更新しました"
    else
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "OpenAI API key for video generation" \
            --secret-string "$openai_key" \
            --region "$REGION"
        log_success "OpenAI API キーを作成しました"
    fi
}

# Google認証情報の設定
setup_google_secret() {
    local secret_name="${PROJECT_PREFIX}/google-credentials-${STAGE}"

    log_info "Google認証情報の設定を開始します..."

    if check_secret_exists "$secret_name"; then
        log_warning "Secret '$secret_name' は既に存在します"
        read -p "上書きしますか? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Google認証情報の設定をスキップします"
            return
        fi
    fi

    echo "Google Service Account JSON ファイルのパスを入力してください:"
    read json_file_path

    if [[ ! -f "$json_file_path" ]]; then
        log_error "ファイルが見つかりません: $json_file_path"
        return 1
    fi

    # JSON形式の検証
    if ! jq empty "$json_file_path" 2>/dev/null; then
        log_error "無効なJSON形式です"
        return 1
    fi

    if check_secret_exists "$secret_name"; then
        aws secretsmanager update-secret \
            --secret-id "$secret_name" \
            --secret-string "file://$json_file_path" \
            --region "$REGION"
        log_success "Google認証情報を更新しました"
    else
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "Google service account credentials for Sheets API" \
            --secret-string "file://$json_file_path" \
            --region "$REGION"
        log_success "Google認証情報を作成しました"
    fi
}

# YouTube認証情報の設定
setup_youtube_secret() {
    local secret_name="${PROJECT_PREFIX}/youtube-credentials-${STAGE}"

    log_info "YouTube認証情報の設定を開始します..."

    if check_secret_exists "$secret_name"; then
        log_warning "Secret '$secret_name' は既に存在します"
        read -p "上書きしますか? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "YouTube認証情報の設定をスキップします"
            return
        fi
    fi

    echo "YouTube OAuth 認証情報を入力してください..."
    echo "Client ID:"
    read client_id
    echo "Client Secret:"
    read -s client_secret
    echo "Refresh Token:"
    read -s refresh_token

    # JSON を構築
    youtube_credentials=$(jq -n \
        --arg client_id "$client_id" \
        --arg client_secret "$client_secret" \
        --arg refresh_token "$refresh_token" \
        '{
            client_id: $client_id,
            client_secret: $client_secret,
            refresh_token: $refresh_token
        }')

    if check_secret_exists "$secret_name"; then
        aws secretsmanager update-secret \
            --secret-id "$secret_name" \
            --secret-string "$youtube_credentials" \
            --region "$REGION"
        log_success "YouTube認証情報を更新しました"
    else
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "YouTube API OAuth credentials" \
            --secret-string "$youtube_credentials" \
            --region "$REGION"
        log_success "YouTube認証情報を作成しました"
    fi
}

# 設定確認
verify_secrets() {
    log_info "設定されたSecretsを確認します..."

    local secrets=(
        "${PROJECT_PREFIX}/openai-api-key-${STAGE}"
        "${PROJECT_PREFIX}/google-credentials-${STAGE}"
        "${PROJECT_PREFIX}/youtube-credentials-${STAGE}"
    )

    for secret in "${secrets[@]}"; do
        if check_secret_exists "$secret"; then
            log_success "✓ $secret"
        else
            log_warning "✗ $secret (未設定)"
        fi
    done
}

# メイン実行
main() {
    log_info "=== YouTube動画自動生成システム - Secrets Manager 設定 ==="

    check_aws_cli

    echo ""
    echo "以下のSecretsを設定します:"
    echo "1. OpenAI API キー"
    echo "2. Google認証情報"
    echo "3. YouTube認証情報"
    echo ""

    read -p "続行しますか? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "設定を中止しました"
        exit 0
    fi

    setup_openai_secret
    echo ""

    setup_google_secret
    echo ""

    setup_youtube_secret
    echo ""

    verify_secrets

    log_success "すべての設定が完了しました！"
    log_info "次のステップ: Lambda関数のテストを実行してください"
}

# jq の確認
if ! command -v jq &> /dev/null; then
    log_error "jq がインストールされていません"
    log_info "macOS: brew install jq"
    log_info "Ubuntu: sudo apt-get install jq"
    exit 1
fi

main "$@"
