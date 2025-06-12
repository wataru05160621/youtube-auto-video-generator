# YouTube 自動動画生成システム

**プロジェクト状態**: 🔄 **完全再設計・再構築中**

AWS ネイティブ構成を使った YouTube 自動動画生成パイプラインのプロジェクトです。

## 🚨 重要なお知らせ

このプロジェクトは **2025年6月12日** に完全なクリーンアップと再設計を行いました：

- ✅ **AWS リソース完全削除済み**: CloudFormation スタック、Lambda 関数、S3 バケット、Secrets Manager、ECR リポジトリ等
- ✅ **ローカルコード完全削除済み**: 既存のソースコード、インフラストラクチャコード、設定ファイル等
- ✅ **設計ドキュメント作成完了**: 新しいアーキテクチャ設計と実装ガイド
- 🔄 **実装準備中**: 改良されたアーキテクチャでの再構築待ち

## システム概要

Google スプレッドシートで管理された未処理行をトリガーとして、以下の処理を自動実行します：

1. **OpenAI API** を使った台本／タイトル／説明文の生成
2. **OpenAI Image API（DALL·E）** による静止画生成
3. **Amazon Polly** による音声合成
4. **FFmpeg** による動画編集・結合（Container Image Lambda）
5. **YouTube API** への自動アップロード（Container Image Lambda）

## 新アーキテクチャの特徴

### 🏗️ 階層化されたデプロイメント構造
- **Foundation Layer**: S3、IAM、Secrets Manager
- **Infrastructure Layer**: Lambda Layers、SNS、EventBridge
- **Application Layer**: Lambda Functions、Step Functions

### 🐳 Container Image Lambda の活用
- **ComposeVideoFunction**: FFmpeg を使用した動画合成
- **UploadToYouTubeFunction**: YouTube API での動画アップロード
- **ARM64 アーキテクチャ**: コスト効率の最適化
- **3008MB メモリ制限対応**: AWS Container Image Lambda の制約に準拠

### 🔧 改善されたポイント
- ✅ **循環依存の解決**: CloudFormation スタック間の依存関係を整理
- ✅ **リソース名の統一**: 命名規則の統一によるコンフリクト回避
- ✅ **メモリ制約対応**: Container Image Lambda の 3008MB 制限に対応
- ✅ **エラーハンドリング強化**: Step Functions での堅牢なエラー処理

## プロジェクト構成（予定）

```
youtube-auto-video-generator/
├── infrastructure/
│   ├── bin/                               # CDK アプリケーションエントリーポイント
│   │   ├── foundation/                    # Foundation Layer デプロイ
│   │   ├── infrastructure/                # Infrastructure Layer デプロイ
│   │   └── application/                   # Application Layer デプロイ
│   ├── lib/
│   │   ├── foundation/                    # S3、IAM、Secrets Manager
│   │   ├── infrastructure/                # Layers、SNS、EventBridge
│   │   └── application/                   # Lambda、Step Functions
│   └── config/                            # ステージ設定、リソース命名
├── src/
│   ├── lambda-light/                      # 軽量 Lambda 関数
│   │   ├── ReadSpreadsheetFunction/
│   │   ├── GenerateScriptFunction/
│   │   ├── WriteScriptFunction/
│   │   ├── GenerateImageFunction/
│   │   └── SynthesizeSpeechFunction/
│   └── lambda-heavy/                      # Container Image Lambda 関数
│       ├── ComposeVideoFunction/          # FFmpeg 動画合成
│       └── UploadToYouTubeFunction/       # YouTube アップロード
├── layers/                                # Lambda Layers
│   ├── common/                            # 共通ライブラリ
│   ├── ffmpeg/                            # FFmpeg バイナリ
│   └── google-apis/                       # Google APIs
└── docs/                                  # ドキュメント
    ├── ARCHITECTURE_REDESIGN.md           # 設計見直し詳細
    ├── IMPROVED_PROJECT_DESIGN.md         # 改良された設計仕様
    ├── IMPLEMENTATION_MIGRATION_GUIDE.md  # 実装移行ガイド
    ├── CONTAINER_IMAGE_LAMBDA_GUIDE.md    # Container Image Lambda ガイド
    └── PROJECT_RESTART_PLAN.md            # プロジェクト再開計画
```

## セットアップ手順（実装後）

### 前提条件
- AWS CDK v2 インストール済み
- Docker Desktop 実行中
- AWS CLI 設定済み（適切な権限）

### デプロイメント順序
```bash
# 1. Foundation Layer
cdk deploy VideoGen-S3-dev VideoGen-IAM-dev VideoGen-Secrets-dev

# 2. Infrastructure Layer  
cdk deploy VideoGen-Layers-dev VideoGen-SNS-dev VideoGen-Events-dev

# 3. Application Layer
cdk deploy VideoGen-LambdaLight-dev VideoGen-LambdaHeavy-dev VideoGen-StepFunctions-dev
```

## 開発状況

- 🔄 **現在**: 設計完了、実装準備中
- 📋 **次のステップ**: Foundation Layer の実装開始
- 🎯 **目標**: 改良されたアーキテクチャでの完全自動化システム構築

## AI エージェント対応

このプロジェクトは **GitHub Copilot エージェント機能** を活用した自動ビルド・デプロイに対応予定です。

詳細な手順については `ai_agent_setup_guide.md` を参照してください。

## ライセンス

MIT License
