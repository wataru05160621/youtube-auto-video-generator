# YouTube 自動動画生成システム

AWS ネイティブ構成を使った YouTube 自動動画生成パイプラインです。

## 🎯 概要

Google スプレッドシートで管理された未処理行をトリガーとして、以下の処理を自動実行します：

1. **台本生成**: OpenAI API を使った台本／タイトル／説明文の生成
2. **画像生成**: OpenAI Image API（DALL·E）による静止画生成
3. **音声合成**: Amazon Polly による音声合成
4. **動画作成**: FFmpeg による動画編集・結合
5. **アップロード**: YouTube への自動アップロード

## 🏗️ アーキテクチャ

- **AWS Lambda**: 各処理ステップの実行
- **AWS Step Functions**: ワークフローの管理
- **Amazon EventBridge**: 定期実行のスケジューリング
- **Amazon S3**: ファイルストレージ
- **Amazon Polly**: 音声合成
- **AWS Secrets Manager**: API キーの管理

## 📁 プロジェクト構成

```
youtube-auto-video-generator/
├── infrastructure/                         # AWS CDK によるインフラコード
│   ├── bin/                               # CDK アプリケーションエントリポイント
│   ├── lib/                               # CDK スタック定義
│   └── layers/                            # Lambda レイヤー（FFmpeg等）
├── src/                                   # Lambda 関数のソースコード
│   ├── ReadSpreadsheetFunction/           # スプレッドシート読み取り
│   ├── GenerateScriptFunction/            # 台本生成
│   ├── WriteScriptFunction/               # スプレッドシート書き込み
│   ├── GenerateImageFunction/             # 画像生成
│   ├── SynthesizeSpeechFunction/          # 音声合成
│   ├── ComposeVideoFunction/              # 動画編集・結合
│   └── UploadToYouTubeFunction/           # YouTube アップロード
├── .github/                               # GitHub Actions ワークフロー
└── docs/                                  # ドキュメント
```

## 🚀 セットアップ

### 前提条件

- Node.js 18+
- AWS CLI 設定済み
- AWS CDK v2
- GitHub CLI (オプション)

### 1. プロジェクトのクローン

```bash
git clone https://github.com/wataru05160621/youtube-auto-video-generator.git
cd youtube-auto-video-generator
```

### 2. 依存関係のインストール

```bash
npm install
cd infrastructure && npm install
```

### 3. AWS 設定

```bash
# AWS プロファイルの設定（開発環境）
aws configure --profile dev

# AWS プロファイルの設定（本番環境）
aws configure --profile prod
```

### 4. 必要な API キーの設定

#### 🚀 クイックセットアップ（推奨）
```bash
# 自動設定スクリプトを実行
./scripts/setup-secrets.sh

# 設定確認
./scripts/test-secrets.sh
```

#### 📋 必要なAPI キー
AWS Secrets Manager に以下の認証情報を設定：

- **OpenAI API キー**: `video-generator/openai-api-key-dev`
- **Google認証情報**: `video-generator/google-credentials-dev`  
- **YouTube認証情報**: `video-generator/youtube-credentials-dev`

詳細な設定方法は [クイックスタートガイド](./SECRETS_QUICKSTART.md) または [詳細設定ガイド](./SECRETS_MANAGER_SETUP_GUIDE.md) を参照してください。

### 5. デプロイ

```bash
# 開発環境
npm run deploy:dev

# 本番環境
npm run deploy:prod
```

## 🛠️ 開発

### ローカル開発

```bash
# 依存関係インストール
npm install

# ビルド
npm run build

# テスト実行
npm test

# リンター実行
npm run lint

# フォーマット
npm run format
```

### 新しい Lambda 関数の追加

1. `src/` ディレクトリに新しいフォルダを作成
2. `index.ts`, `package.json`, `tsconfig.json` を作成
3. `infrastructure/lib/lambda-stack.ts` にLambda関数定義を追加
4. Step Functions の定義を更新

## 📋 設定

### 環境変数

各 Lambda 関数で使用される主な環境変数：

- `OPENAI_API_KEY_SECRET_NAME`: OpenAI API キーのSecrets Manager名
- `GOOGLE_CREDENTIALS_SECRET_NAME`: Google認証情報のSecrets Manager名
- `S3_BUCKET_NAME`: ファイル保存用S3バケット名
- `SPREADSHEET_ID`: 対象のGoogle スプレッドシートID

### スケジュール設定

EventBridge で毎日 JST 4:00 (UTC 19:00) に実行されるように設定されています。
スケジュールの変更は `infrastructure/lib/stepfunctions-stack.ts` で行えます。

## 🧪 テスト

```bash
# 全てのテストを実行
npm test

# 特定のLambda関数のテストを実行
cd src/ReadSpreadsheetFunction && npm test
```

## 📖 ドキュメント

詳細な設計・実装計画については、以下のドキュメントを参照してください：

- [VideoGenerationPlan.md](../VideoGenerationPlan.md) - 詳細な設計・実装計画
- [CHANNEL_MANAGEMENT_GUIDE.md](../CHANNEL_MANAGEMENT_GUIDE.md) - チャンネル管理ガイド
- [MULTI_TENANT_WORKFLOW_GUIDE.md](../MULTI_TENANT_WORKFLOW_GUIDE.md) - マルチテナント対応

## 🤝 貢献

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 📞 サポート

質問やイシューがある場合は、[GitHub Issues](https://github.com/wataru05160621/youtube-auto-video-generator/issues) を作成してください。
