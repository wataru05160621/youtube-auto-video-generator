#!/bin/bash

# テスト用 Secrets Manager 設定スクリプト
# 実際のAPI キーなしでシステムテストを実行するためのダミーデータを設定

set -e

REGION="ap-northeast-1"
STAGE="dev"
PROJECT_PREFIX="video-generator"

# 色付きログ
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# テスト用OpenAI API キー
setup_test_openai_secret() {
    local secret_name="${PROJECT_PREFIX}/openai-api-key-${STAGE}"

    log_info "テスト用OpenAI API キーを設定中..."

    # テスト用のダミーキー（実際のAPIコールは失敗するが、Secret取得はテストできる）
    local test_api_key="sk-test-dummy-key-for-development-testing-only"

    aws secretsmanager create-secret \
        --name "$secret_name" \
        --description "Test OpenAI API key for development" \
        --secret-string "$test_api_key" \
        --region "$REGION" || \
    aws secretsmanager update-secret \
        --secret-id "$secret_name" \
        --secret-string "$test_api_key" \
        --region "$REGION"

    log_success "テスト用OpenAI API キーを設定しました"
}

# テスト用Google認証情報
setup_test_google_secret() {
    local secret_name="${PROJECT_PREFIX}/google-credentials-${STAGE}"

    log_info "テスト用Google認証情報を設定中..."

    # テスト用のダミー認証情報
    local test_credentials='{
        "type": "service_account",
        "project_id": "test-project-id",
        "private_key_id": "test-key-id",
        "private_key": "-----BEGIN PRIVATE KEY-----\nTEST_PRIVATE_KEY_FOR_DEVELOPMENT\n-----END PRIVATE KEY-----\n",
        "client_email": "test-service@test-project.iam.gserviceaccount.com",
        "client_id": "123456789",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/test-service%40test-project.iam.gserviceaccount.com"
    }'

    aws secretsmanager create-secret \
        --name "$secret_name" \
        --description "Test Google service account credentials" \
        --secret-string "$test_credentials" \
        --region "$REGION" || \
    aws secretsmanager update-secret \
        --secret-id "$secret_name" \
        --secret-string "$test_credentials" \
        --region "$REGION"

    log_success "テスト用Google認証情報を設定しました"
}

# テスト用YouTube認証情報
setup_test_youtube_secret() {
    local secret_name="${PROJECT_PREFIX}/youtube-credentials-${STAGE}"

    log_info "テスト用YouTube認証情報を設定中..."

    # テスト用のダミー認証情報
    local test_credentials='{
        "client_id": "test-client-id.googleusercontent.com",
        "client_secret": "test-client-secret",
        "refresh_token": "test-refresh-token"
    }'

    aws secretsmanager create-secret \
        --name "$secret_name" \
        --description "Test YouTube API OAuth credentials" \
        --secret-string "$test_credentials" \
        --region "$REGION" || \
    aws secretsmanager update-secret \
        --secret-id "$secret_name" \
        --secret-string "$test_credentials" \
        --region "$REGION"

    log_success "テスト用YouTube認証情報を設定しました"
}

# メイン実行
main() {
    log_info "=== テスト用 Secrets Manager 設定 ==="
    log_warning "これはテスト用のダミーデータです。実際のAPIコールは失敗します。"

    read -p "テスト用Secretsを設定しますか? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "設定を中止しました"
        exit 0
    fi

    setup_test_openai_secret
    setup_test_google_secret
    setup_test_youtube_secret

    log_success "テスト用Secretsの設定が完了しました！"
    log_info "次のステップ: ./scripts/test-secrets.sh で設定を確認してください"
    log_warning "実際のAPIテストには本物のAPI キーが必要です"
}

main "$@"
