#!/bin/bash

# Secrets Manager 設定確認・テストスクリプト
# Usage: ./test-secrets.sh

set -e

REGION="ap-northeast-1"
STAGE="dev"
PROJECT_PREFIX="video-generator"

# 色付きログ
GREEN='\033[0;32m'
RED='\033[0;31m'
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

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Secret の存在確認
test_secret_exists() {
    local secret_name=$1
    local description=$2

    log_info "テスト中: $description"

    if aws secretsmanager describe-secret --secret-id "$secret_name" --region "$REGION" &> /dev/null; then
        log_success "✓ Secret '$secret_name' が存在します"

        # 値の取得テスト（最初の20文字のみ表示）
        local secret_value
        secret_value=$(aws secretsmanager get-secret-value --secret-id "$secret_name" --region "$REGION" --query 'SecretString' --output text 2>/dev/null)

        if [[ ${#secret_value} -gt 20 ]]; then
            local preview="${secret_value:0:20}..."
            log_info "  値プレビュー: $preview"
        else
            log_info "  値の長さ: ${#secret_value} 文字"
        fi

        return 0
    else
        log_error "✗ Secret '$secret_name' が見つかりません"
        return 1
    fi
}

# JSON形式の検証
validate_json_secret() {
    local secret_name=$1
    local description=$2

    log_info "JSON検証中: $description"

    local secret_value
    secret_value=$(aws secretsmanager get-secret-value --secret-id "$secret_name" --region "$REGION" --query 'SecretString' --output text 2>/dev/null)

    if echo "$secret_value" | jq empty 2>/dev/null; then
        log_success "✓ 有効なJSON形式です"

        # JSONのキー一覧を表示
        local keys
        keys=$(echo "$secret_value" | jq -r 'keys[]' 2>/dev/null)
        log_info "  含まれるキー: $(echo "$keys" | tr '\n' ', ' | sed 's/,$//')"

        return 0
    else
        log_error "✗ 無効なJSON形式です"
        return 1
    fi
}

# OpenAI API キーの検証
validate_openai_key() {
    local secret_name="${PROJECT_PREFIX}/openai-api-key-${STAGE}"

    log_info "OpenAI API キーの検証中..."

    local api_key
    api_key=$(aws secretsmanager get-secret-value --secret-id "$secret_name" --region "$REGION" --query 'SecretString' --output text 2>/dev/null)

    if [[ $api_key =~ ^sk- ]]; then
        log_success "✓ OpenAI API キーの形式が正しいです"

        # API接続テスト（オプション）
        if command -v curl &> /dev/null; then
            log_info "  API接続テストを実行中..."
            local response
            response=$(curl -s -o /dev/null -w "%{http_code}" \
                -H "Authorization: Bearer $api_key" \
                -H "Content-Type: application/json" \
                "https://api.openai.com/v1/models" \
                --connect-timeout 10)

            if [[ $response == "200" ]]; then
                log_success "  ✓ OpenAI API 接続成功"
            else
                log_warning "  ⚠ OpenAI API 接続エラー (HTTP $response)"
            fi
        fi

        return 0
    else
        log_error "✗ OpenAI API キーの形式が正しくありません (sk-で始まっていません)"
        return 1
    fi
}

# Google認証情報の検証
validate_google_credentials() {
    local secret_name="${PROJECT_PREFIX}/google-credentials-${STAGE}"

    log_info "Google認証情報の検証中..."

    local credentials
    credentials=$(aws secretsmanager get-secret-value --secret-id "$secret_name" --region "$REGION" --query 'SecretString' --output text 2>/dev/null)

    # 必須フィールドの確認
    local required_fields=("type" "project_id" "private_key" "client_email")
    local missing_fields=()

    for field in "${required_fields[@]}"; do
        if ! echo "$credentials" | jq -e ".$field" &> /dev/null; then
            missing_fields+=("$field")
        fi
    done

    if [[ ${#missing_fields[@]} -eq 0 ]]; then
        log_success "✓ Google認証情報の必須フィールドが揃っています"

        local project_id
        project_id=$(echo "$credentials" | jq -r '.project_id')
        local client_email
        client_email=$(echo "$credentials" | jq -r '.client_email')

        log_info "  プロジェクトID: $project_id"
        log_info "  サービスアカウント: $client_email"

        return 0
    else
        log_error "✗ 必須フィールドが不足しています: ${missing_fields[*]}"
        return 1
    fi
}

# YouTube認証情報の検証
validate_youtube_credentials() {
    local secret_name="${PROJECT_PREFIX}/youtube-credentials-${STAGE}"

    log_info "YouTube認証情報の検証中..."

    local credentials
    credentials=$(aws secretsmanager get-secret-value --secret-id "$secret_name" --region "$REGION" --query 'SecretString' --output text 2>/dev/null)

    # 必須フィールドの確認
    local required_fields=("client_id" "client_secret" "refresh_token")
    local missing_fields=()

    for field in "${required_fields[@]}"; do
        if ! echo "$credentials" | jq -e ".$field" &> /dev/null; then
            missing_fields+=("$field")
        fi
    done

    if [[ ${#missing_fields[@]} -eq 0 ]]; then
        log_success "✓ YouTube認証情報の必須フィールドが揃っています"

        local client_id
        client_id=$(echo "$credentials" | jq -r '.client_id')
        log_info "  Client ID: ${client_id:0:20}..."

        return 0
    else
        log_error "✗ 必須フィールドが不足しています: ${missing_fields[*]}"
        return 1
    fi
}

# メイン実行
main() {
    log_info "=== Secrets Manager 設定確認テスト ==="

    # AWS CLI の確認
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI がインストールされていません"
        exit 1
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS認証が設定されていません"
        exit 1
    fi

    echo ""

    # 各Secret の存在確認
    local secrets=(
        "${PROJECT_PREFIX}/openai-api-key-${STAGE};OpenAI API キー"
        "${PROJECT_PREFIX}/google-credentials-${STAGE};Google認証情報"
        "${PROJECT_PREFIX}/youtube-credentials-${STAGE};YouTube認証情報"
    )

    local all_exists=true

    for secret_info in "${secrets[@]}"; do
        IFS=';' read -r secret_name description <<< "$secret_info"
        if ! test_secret_exists "$secret_name" "$description"; then
            all_exists=false
        fi
        echo ""
    done

    if [[ $all_exists == false ]]; then
        log_error "一部のSecretsが設定されていません"
        log_info "設定方法: ./scripts/setup-secrets.sh を実行してください"
        exit 1
    fi

    # 詳細検証
    log_info "=== 詳細検証 ==="
    echo ""

    # OpenAI API キー検証
    if test_secret_exists "${PROJECT_PREFIX}/openai-api-key-${STAGE}" "OpenAI API キー" &> /dev/null; then
        validate_openai_key
        echo ""
    fi

    # Google認証情報検証
    if test_secret_exists "${PROJECT_PREFIX}/google-credentials-${STAGE}" "Google認証情報" &> /dev/null; then
        validate_json_secret "${PROJECT_PREFIX}/google-credentials-${STAGE}" "Google認証情報"
        validate_google_credentials
        echo ""
    fi

    # YouTube認証情報検証
    if test_secret_exists "${PROJECT_PREFIX}/youtube-credentials-${STAGE}" "YouTube認証情報" &> /dev/null; then
        validate_json_secret "${PROJECT_PREFIX}/youtube-credentials-${STAGE}" "YouTube認証情報"
        validate_youtube_credentials
        echo ""
    fi

    log_success "すべてのSecretsが正常に設定されています！"
    log_info "次のステップ: Lambda関数の個別テストを実行してください"
}

main "$@"
