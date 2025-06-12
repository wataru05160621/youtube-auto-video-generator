# YouTube動画自動生成システム - プロジェクト再開プラン

## 📋 現在の状況サマリー

### 前回のデプロイ結果
- ✅ 基本的なLambda関数のデプロイは成功
- ✅ Step Functions ワークフローの作成は完了
- ✅ S3、SNS、EventBridge などのインフラは正常
- ❌ Container Image Lambda のデプロイで複数の問題が発生
- ❌ 循環依存エラーによりデプロイが不安定

### 学習成果
1. **Container Image Lambda の制約理解**
   - メモリ最大値: 3008MB（通常Lambda: 3072MB）
   - ARM64アーキテクチャの重要性
   - ECR権限とネットワーク要件

2. **CloudFormation アーキテクチャ設計**
   - 循環依存の根本原因
   - エクスポート名の一意性問題
   - スタック分離の重要性

3. **AWS デプロイのベストプラクティス**
   - 段階的デプロイの必要性
   - リソース命名規則の統一
   - 依存関係管理の重要性

## 🎯 改善されたプロジェクト方針

### 設計原則
1. **安定性優先**: 確実にデプロイできるアーキテクチャ
2. **段階的実装**: Foundation → Infrastructure → Application の順序
3. **失敗の分離**: 各レイヤーでの問題を他に波及させない
4. **監視可能性**: 各ステップでの動作確認を重視

### 技術選択の理由
1. **Container Image Lambda**: 重い処理（動画合成、YouTube アップロード）に必要
2. **ARM64 アーキテクチャ**: コスト効率とパフォーマンスの最適化
3. **スタック分離**: 循環依存の完全回避
4. **IAM事前定義**: 権限管理の一元化

## 📚 作成済みドキュメント

### 1. アーキテクチャ設計書
- **ARCHITECTURE_REDESIGN.md**: 問題分析と新設計の概要
- **IMPROVED_PROJECT_DESIGN.md**: 詳細な技術仕様とスタック構成

### 2. 実装ガイド
- **IMPLEMENTATION_MIGRATION_GUIDE.md**: 段階的移行計画
- **CONTAINER_IMAGE_LAMBDA_GUIDE.md**: Container Image Lambda の詳細実装

### 3. 設定・運用
- リソース命名規則の統一
- 段階的デプロイスクリプト
- 検証・テスト手順

## 🚀 次の実装ステップ

### Phase 1: Foundation Layer 実装 (推定: 2-3時間)

#### 1.1 プロジェクト構造の再編成
```bash
# 新しいディレクトリ構造の作成
infrastructure/
├── lib/
│   ├── foundation/          # 基盤レイヤー
│   ├── infrastructure/      # インフラレイヤー
│   └── application/         # アプリケーションレイヤー
├── bin/
│   ├── foundation/          # Foundation デプロイ用
│   ├── infrastructure/      # Infrastructure デプロイ用
│   └── application/         # Application デプロイ用
└── config/                  # 設定ファイル
```

#### 1.2 設定ファイルの実装
- **stage-config.ts**: 環境別設定
- **resource-naming.ts**: 命名規則の統一

#### 1.3 Foundation スタックの実装
- **S3Stack**: バケット作成（データ移行考慮）
- **IAMStack**: 全ロールの事前定義
- **SecretsStack**: 認証情報管理

#### 1.4 Foundation Layer のデプロイ
```bash
cdk deploy VideoGen-S3-dev --require-approval never
cdk deploy VideoGen-IAM-dev --require-approval never
cdk deploy VideoGen-Secrets-dev --require-approval never
```

### Phase 2: Infrastructure Layer 実装 (推定: 1-2時間)

#### 2.1 Infrastructure スタックの実装
- **LayersStack**: Lambda Layer の最適化
- **SNSStack**: 通知システムの分離
- **EventBridgeStack**: イベント管理

#### 2.2 Infrastructure Layer のデプロイ
```bash
cdk deploy VideoGen-Layers-dev --require-approval never
cdk deploy VideoGen-SNS-dev --require-approval never
cdk deploy VideoGen-Events-dev --require-approval never
```

### Phase 3: Application Layer 実装 (推定: 3-4時間)

#### 3.1 Lambda Light Functions
- ReadSpreadsheetFunction
- GenerateScriptFunction
- WriteScriptFunction
- GenerateImageFunction
- SynthesizeSpeechFunction

#### 3.2 Lambda Heavy Functions (Container Image)
- ComposeVideoFunction: FFmpeg での動画合成
- UploadToYouTubeFunction: YouTube API連携

#### 3.3 Step Functions Integration
- ワークフロー定義
- エラーハンドリング
- 監視設定

#### 3.4 Application Layer のデプロイ
```bash
cdk deploy VideoGen-LambdaLight-dev --require-approval never
cdk deploy VideoGen-LambdaHeavy-dev --require-approval never
cdk deploy VideoGen-StepFunctions-dev --require-approval never
```

### Phase 4: データ移行とクリーンアップ (推定: 1時間)

#### 4.1 データ移行
- S3 バケット間のデータ移行
- Secrets Manager の設定移行
- 設定値の更新

#### 4.2 旧スタックの削除
```bash
# 旧スタックの安全な削除
cdk destroy VideoGenerator-StepFunctions-dev --force
cdk destroy VideoGenerator-LambdaHeavy-dev --force
cdk destroy VideoGenerator-Lambda-dev --force
cdk destroy VideoGenerator-SNS-dev --force
cdk destroy VideoGenerator-Layers-dev --force
cdk destroy VideoGenerator-S3-dev --force
```

### Phase 5: エンドツーエンドテスト (推定: 1-2時間)

#### 5.1 機能テスト
- 各Lambda関数の単体テスト
- Step Functions ワークフローテスト
- Container Image Lambda の動作確認

#### 5.2 統合テスト
- 完全なワークフロー実行
- エラーハンドリングの確認
- パフォーマンス測定

## 📋 実装チェックリスト

### Foundation Layer
- [ ] config/stage-config.ts の作成
- [ ] config/resource-naming.ts の作成
- [ ] lib/foundation/s3-stack.ts の実装
- [ ] lib/foundation/iam-stack.ts の実装
- [ ] lib/foundation/secrets-stack.ts の実装
- [ ] bin/foundation/deploy-foundation.ts の作成
- [ ] Foundation Layer のデプロイ確認

### Infrastructure Layer
- [ ] lib/infrastructure/layers-stack.ts の実装
- [ ] lib/infrastructure/sns-stack.ts の実装
- [ ] lib/infrastructure/events-stack.ts の実装
- [ ] bin/infrastructure/deploy-infrastructure.ts の作成
- [ ] Infrastructure Layer のデプロイ確認

### Application Layer
- [ ] lib/application/lambda-light-stack.ts の実装
- [ ] lib/application/lambda-heavy-stack.ts の実装
- [ ] lib/application/stepfunctions-stack.ts の実装
- [ ] src/ComposeVideoFunction/ の Container Image 実装
- [ ] src/UploadToYouTubeFunction/ の Container Image 実装
- [ ] bin/application/deploy-application.ts の作成
- [ ] Application Layer のデプロイ確認

### Container Image Functions
- [ ] ComposeVideoFunction/Dockerfile の最適化
- [ ] ComposeVideoFunction/package.json の依存関係整理
- [ ] ComposeVideoFunction/src/index.ts の実装
- [ ] UploadToYouTubeFunction/Dockerfile の作成
- [ ] UploadToYouTubeFunction/package.json の作成
- [ ] UploadToYouTubeFunction/src/index.ts の実装
- [ ] ARM64 アーキテクチャでのビルド確認
- [ ] メモリサイズ制限（3008MB）の遵守確認

### データ移行・クリーンアップ
- [ ] S3 データの新バケットへの移行
- [ ] Secrets Manager 設定の移行
- [ ] 旧スタックの安全な削除
- [ ] リソースクリーンアップの確認

### テスト・検証
- [ ] Foundation Layer の動作確認
- [ ] Infrastructure Layer の動作確認
- [ ] Application Layer の動作確認
- [ ] Container Image Lambda の実行テスト
- [ ] Step Functions ワークフローの実行テスト
- [ ] エンドツーエンドテストの実行
- [ ] エラーハンドリングの確認
- [ ] ログとモニタリングの確認

## ⚡ 優先度の高い改善点

### 1. Container Image Lambda の安定化
- ARM64 アーキテクチャの統一
- メモリサイズ制限の遵守（3008MB以下）
- ECR プッシュ権限の確保

### 2. アーキテクチャの安定化
- 循環依存の完全排除
- CloudFormation エクスポート名の一意性保証
- スタック間依存関係の明確化

### 3. デプロイプロセスの改善
- 段階的デプロイの自動化
- 各段階での検証スクリプト
- ロールバック手順の確立

## 🎯 期待される成果

### 短期的な成果（1-2週間）
1. **安定したデプロイ**: 循環依存やエラーのない確実なデプロイ
2. **Container Image Lambda の動作**: 重い処理の実現
3. **完全なワークフロー**: エンドツーエンドでの動画生成

### 中期的な成果（1ヶ月）
1. **プロダクション準備**: 本番環境での運用準備
2. **監視・アラート**: 運用監視システムの構築
3. **パフォーマンス最適化**: 処理時間・コストの最適化

### 長期的な成果（3ヶ月）
1. **スケーラビリティ**: 複数チャンネル対応
2. **機能拡張**: 新しい動画生成機能の追加
3. **自動化の推進**: 完全自動化された動画生成パイプライン

## 📞 次のアクション

1. **Foundation Layer の実装開始**
   - config ファイルの作成
   - Foundation スタックの実装
   - 初回デプロイの実行

2. **進捗確認とフィードバック**
   - 各段階での動作確認
   - 問題発生時の対応計画
   - 必要に応じた設計調整

3. **ドキュメントの更新**
   - 実装進捗の記録
   - トラブルシューティング情報の追加
   - ベストプラクティスの文書化

---

**プロジェクト再開準備完了**: 改善されたアーキテクチャと詳細な実装ガイドが整いました。Foundation Layer から段階的に実装を開始できます。
