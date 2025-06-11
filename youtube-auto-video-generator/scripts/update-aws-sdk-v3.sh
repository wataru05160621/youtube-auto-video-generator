#!/bin/bash

# AWS SDK v2 から v3 への一括更新スクリプト

set -e

# Lambda関数のディレクトリ一覧
LAMBDA_DIRS=(
    "GenerateScriptFunction"
    "WriteScriptFunction"
    "SynthesizeSpeechFunction"
    "ComposeVideoFunction"
    "UploadToYouTubeFunction"
)

BASE_DIR="/Users/shinzato/programing/create_movie/youtube-auto-video-generator/src"

echo "🔄 AWS SDK v2 -> v3 更新を開始します..."

for dir in "${LAMBDA_DIRS[@]}"; do
    LAMBDA_PATH="$BASE_DIR/$dir"
    INDEX_FILE="$LAMBDA_PATH/index.ts"

    if [[ -f "$INDEX_FILE" ]]; then
        echo "📝 更新中: $dir"

        # SecretsManager の import を更新
        sed -i '' 's/import { SecretsManager } from '\''aws-sdk'\'';/import { SecretsManagerClient, GetSecretValueCommand } from '\''@aws-sdk\/client-secrets-manager'\'';/g' "$INDEX_FILE"

        # S3 の import を更新
        sed -i '' 's/import { S3 } from '\''aws-sdk'\'';/import { S3Client, PutObjectCommand, GetObjectCommand } from '\''@aws-sdk\/client-s3'\'';/g' "$INDEX_FILE"

        # SNS の import を更新
        sed -i '' 's/import { SNS } from '\''aws-sdk'\'';/import { SNSClient, PublishCommand } from '\''@aws-sdk\/client-sns'\'';/g' "$INDEX_FILE"

        # 複合 import を更新
        sed -i '' 's/import { SecretsManager, S3 } from '\''aws-sdk'\'';/import { SecretsManagerClient, GetSecretValueCommand } from '\''@aws-sdk\/client-secrets-manager'\'';\'$'\nimport { S3Client, PutObjectCommand, GetObjectCommand } from '\''@aws-sdk\/client-s3'\'';/g' "$INDEX_FILE"

        sed -i '' 's/import { SecretsManager, SNS } from '\''aws-sdk'\'';/import { SecretsManagerClient, GetSecretValueCommand } from '\''@aws-sdk\/client-secrets-manager'\'';\'$'\nimport { SNSClient, PublishCommand } from '\''@aws-sdk\/client-sns'\'';/g' "$INDEX_FILE"

        # クライアント初期化を更新
        sed -i '' 's/const secretsManager = new SecretsManager();/const secretsManager = new SecretsManagerClient();/g' "$INDEX_FILE"
        sed -i '' 's/const s3 = new S3();/const s3 = new S3Client();/g' "$INDEX_FILE"
        sed -i '' 's/const sns = new SNS();/const sns = new SNSClient();/g' "$INDEX_FILE"

        # APIコールを更新 (基本的なパターン)
        sed -i '' 's/secretsManager\.getSecretValue({ SecretId: secretName })\.promise()/secretsManager.send(new GetSecretValueCommand({ SecretId: secretName }))/g' "$INDEX_FILE"

        echo "✅ 完了: $dir"
    else
        echo "⚠️  ファイルが見つかりません: $INDEX_FILE"
    fi
done

echo "🎉 AWS SDK v3 への更新が完了しました!"
echo "⚠️  手動で以下を確認してください:"
echo "   - S3のputObject、getObjectなどの複雑なAPIコール"
echo "   - SNSのpublishなどのAPIコール"
echo "   - エラーハンドリングの調整"
