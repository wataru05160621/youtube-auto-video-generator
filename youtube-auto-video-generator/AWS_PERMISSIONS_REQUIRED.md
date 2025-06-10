# AWS デプロイに必要な権限

## 現在の状況
- IAMユーザー: `arn:aws:iam::455931011903:user/developer-user`
- アカウントID: `455931011903`
- リージョン: `ap-northeast-1`

## 発生している権限エラー
```
AccessDenied: User: arn:aws:iam::455931011903:user/developer-user is not authorized to perform: cloudformation:GetTemplate
```

## YouTube動画生成システムのデプロイに必要な権限

### 必須権限ポリシー

#### 1. CloudFormation権限
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudformation:*"
            ],
            "Resource": "*"
        }
    ]
}
```

#### 2. IAM権限（ロール・ポリシー作成用）
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "iam:CreateRole",
                "iam:DeleteRole",
                "iam:GetRole",
                "iam:PassRole",
                "iam:AttachRolePolicy",
                "iam:DetachRolePolicy",
                "iam:PutRolePolicy",
                "iam:DeleteRolePolicy",
                "iam:GetRolePolicy",
                "iam:ListRolePolicies",
                "iam:TagRole",
                "iam:UntagRole",
                "iam:ListInstanceProfilesForRole"
            ],
            "Resource": [
                "arn:aws:iam::455931011903:role/VideoGenerator-*",
                "arn:aws:iam::455931011903:role/cdk-*"
            ]
        }
    ]
}
```

#### 3. Lambda権限
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "lambda:*"
            ],
            "Resource": "*"
        }
    ]
}
```

#### 4. S3権限
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:*"
            ],
            "Resource": "*"
        }
    ]
}
```

#### 5. Step Functions権限
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "states:*"
            ],
            "Resource": "*"
        }
    ]
}
```

#### 6. その他必要なサービス権限
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "sns:*",
                "events:*",
                "logs:*",
                "polly:*",
                "secretsmanager:*"
            ],
            "Resource": "*"
        }
    ]
}
```

### 推奨アプローチ

#### オプション1: カスタムポリシー作成
上記の権限を組み合わせたカスタムポリシーを作成し、`developer-user`に添付する。

#### オプション2: 管理されたポリシー使用（簡単だが権限過多）
```
- AWSCloudFormationFullAccess
- IAMFullAccess
- AWSLambda_FullAccess
- AmazonS3FullAccess
- AWSStepFunctionsFullAccess
- AmazonSNSFullAccess
- AmazonEventBridgeFullAccess
- CloudWatchLogsFullAccess
```

#### オプション3: 管理者権限（テスト環境推奨）
```
- AdministratorAccess
```

## セキュリティ考慮事項

- 本番環境では最小権限の原則に従い、必要最小限の権限のみを付与
- リソース固有のARNを使用してスコープを制限
- 定期的な権限レビューを実施
- CloudTrailでのアクション監査を有効化

## 次のステップ

1. AWS管理者に上記権限の追加を依頼
2. または、管理者アカウントでAWS CLIを再設定
3. CDKブートストラップとデプロイを実行
