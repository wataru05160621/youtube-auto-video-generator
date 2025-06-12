# YouTube動画自動生成システム - アーキテクチャ再設計

## 🚨 前回の問題と解決策

### 発生した問題

1. **循環依存エラー**
   - LambdaStack と LambdaHeavyStack 間の相互依存
   - Step Functions が両方のスタックの関数を参照する際の循環参照

2. **CloudFormation エクスポート名重複**
   - 複数のスタックで同じエクスポート名が使用される
   - AWS アカウント・リージョン内でのエクスポート名の一意性違反

3. **Container Image Lambda 制約**
   - 最大メモリサイズ: 3008MB (通常 Lambda の 3072MB より小さい)
   - ECR プッシュ時のネットワーク接続問題

4. **関数名の重複**
   - 同一リージョン内での Lambda 関数名の重複

### 改善された設計原則

1. **単一責任原則**: 各スタックは明確な責任を持つ
2. **依存関係の単方向性**: 循環依存を避ける階層構造
3. **一意性の保証**: 全てのリソース名・エクスポート名の一意性
4. **リソース制約の遵守**: AWS サービスの制限内での設計

## 🏗️ 新しいアーキテクチャ設計

### スタック構成と依存関係

```
Foundation Layer
├── S3Stack (基盤)
├── IAMStack (権限管理)
└── SecretsStack (秘密情報管理)
         ↓
Infrastructure Layer  
├── LayersStack (共通レイヤー)
├── SNSStack (通知)
└── EventBridgeStack (イベント処理)
         ↓
Application Layer
├── LambdaLightStack (軽量処理)
├── LambdaHeavyStack (重い処理)
└── StepFunctionsStack (ワークフロー)
```

### スタック別責任分担

#### 1. Foundation Layer

**S3Stack**
- S3バケット
- バケットポリシー
- ライフサイクル設定

**IAMStack**
- 全てのIAMロール
- ポリシー定義
- 他スタックで使用するロールのエクスポート

**SecretsStack**
- Secrets Manager シークレット
- OpenAI API キー
- YouTube OAuth 認証情報
- Google スプレッドシート認証情報

#### 2. Infrastructure Layer

**LayersStack**
- Lambda Layer (共通ライブラリ)
- FFmpeg Layer (動画処理用)
- Google APIs Layer

**SNSStack**
- 通知トピック
- サブスクリプション

**EventBridgeStack**
- スケジュールルール
- カスタムイベントルール

#### 3. Application Layer

**LambdaLightStack** (軽量処理)
- ReadSpreadsheetFunction
- GenerateScriptFunction
- WriteScriptFunction
- GenerateImageFunction
- SynthesizeSpeechFunction

**LambdaHeavyStack** (重い処理 - Container Image)
- ComposeVideoFunction
- UploadToYouTubeFunction

**StepFunctionsStack**
- ステートマシン定義
- ワークフロー実行ロール

### 🔧 技術的な改善点

#### Container Image Lambda の最適化

1. **メモリサイズ制限の遵守**
   ```typescript
   memorySize: 3008, // 最大値を遵守
   ```

2. **アーキテクチャ統一**
   ```typescript
   architecture: lambda.Architecture.ARM_64, // 全て ARM64 で統一
   ```

3. **タイムアウト最適化**
   ```typescript
   timeout: cdk.Duration.minutes(15), // 最大値
   ```

#### エクスポート名の一意性保証

```typescript
// 命名規則: {Service}-{Resource}-{Stage}-{UniqueId}
exportName: `VideoGen-ComposeVideo-${stage}-Arn`
exportName: `VideoGen-UploadYouTube-${stage}-Arn`
exportName: `VideoGen-S3Bucket-${stage}-Name`
```

#### 循環依存の解決

1. **IAM ロールの事前定義**
   - 全てのロールを IAMStack で定義
   - 他スタックで参照のみ

2. **段階的デプロイ**
   ```bash
   # Phase 1: Foundation
   cdk deploy VideoGen-S3-${stage}
   cdk deploy VideoGen-IAM-${stage}
   cdk deploy VideoGen-Secrets-${stage}
   
   # Phase 2: Infrastructure
   cdk deploy VideoGen-Layers-${stage}
   cdk deploy VideoGen-SNS-${stage}
   cdk deploy VideoGen-Events-${stage}
   
   # Phase 3: Application
   cdk deploy VideoGen-LambdaLight-${stage}
   cdk deploy VideoGen-LambdaHeavy-${stage}
   cdk deploy VideoGen-StepFunctions-${stage}
   ```

### 📦 ファイル構造の再編成

```
infrastructure/
├── lib/
│   ├── foundation/
│   │   ├── s3-stack.ts
│   │   ├── iam-stack.ts
│   │   └── secrets-stack.ts
│   ├── infrastructure/
│   │   ├── layers-stack.ts
│   │   ├── sns-stack.ts
│   │   └── events-stack.ts
│   └── application/
│       ├── lambda-light-stack.ts
│       ├── lambda-heavy-stack.ts
│       └── stepfunctions-stack.ts
├── bin/
│   ├── deploy-foundation.ts
│   ├── deploy-infrastructure.ts
│   └── deploy-application.ts
└── config/
    ├── stage-config.ts
    └── resource-naming.ts
```

### 🚀 段階的移行計画

#### Phase 1: アーキテクチャ準備
1. 新しいスタック構造の作成
2. 命名規則の統一
3. 依存関係の整理

#### Phase 2: Foundation Layer デプロイ
1. S3Stack の再作成
2. IAMStack の集約
3. SecretsStack の分離

#### Phase 3: Infrastructure Layer デプロイ
1. LayersStack の最適化
2. SNSStack の分離
3. EventBridgeStack の作成

#### Phase 4: Application Layer デプロイ
1. LambdaLightStack の作成
2. LambdaHeavyStack の Container Image 対応
3. StepFunctionsStack の統合

#### Phase 5: 旧スタックの削除
1. 段階的な移行確認
2. 旧スタックの安全な削除
3. リソースのクリーンアップ

### ⚠️ 注意事項

1. **既存データの保護**
   - S3 バケットのデータは保持
   - Secrets Manager の設定は移行

2. **ダウンタイム最小化**
   - Blue-Green デプロイ方式
   - 段階的な切り替え

3. **コスト最適化**
   - 不要なリソースの削除
   - Container Image の効率化

### 🎯 期待される効果

1. **デプロイの安定性向上**
   - 循環依存の解消
   - 段階的デプロイの実現

2. **メンテナンス性の向上**
   - 責任分担の明確化
   - 独立したスタック管理

3. **スケーラビリティの向上**
   - Container Image Lambda の活用
   - リソース使用量の最適化

---

**次のステップ**: この設計に基づいて新しいインフラストラクチャコードの実装を開始します。
