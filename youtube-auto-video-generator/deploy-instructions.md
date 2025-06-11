# AWS デプロイ手順

## 前提条件
- AWSコンソールで `developer-user` に `AdministratorAccess` ポリシーが付与されていること

## デプロイ手順

### 1. CDKブートストラップ（初回のみ）
```bash
cd /Users/shinzato/programing/create_movie/youtube-auto-video-generator/infrastructure
cdk bootstrap
```

### 2. 全スタックのデプロイ
```bash
cdk deploy --all --require-approval never
```

### 3. 個別スタックデプロイ（必要に応じて）
```bash
# S3バケット
cdk deploy VideoGenerator-S3-dev

# Lambda関数
cdk deploy VideoGenerator-Lambda-dev

# Step Functions
cdk deploy VideoGenerator-StepFunctions-dev

# SNS
cdk deploy VideoGenerator-SNS-dev
```

### 4. デプロイ後の設定
デプロイ完了後、`POST_DEPLOYMENT_SETUP.md` の手順に従って環境変数を設定してください。

## トラブルシューティング

### 権限エラーが出る場合
```bash
aws sts get-caller-identity
```
でユーザーを確認し、AWSコンソールで権限を再確認してください。

### スタック削除が必要な場合
```bash
cdk destroy --all
```
