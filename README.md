# YouTube 自動動画生成システム

AWS ネイティブ構成を使った YouTube 自動動画生成パイプラインのプロジェクトです。

## 概要

Google スプレッドシートで管理された未処理行をトリガーとして、以下の処理を自動実行します：

1. OpenAI API を使った台本／タイトル／説明文の生成
2. OpenAI Image API（DALL·E）による静止画生成
3. Amazon Polly による音声合成
4. FFmpeg による動画編集・結合
5. YouTube への自動アップロード

## アーキテクチャ

- **AWS Lambda**: 各処理ステップの実行
- **AWS Step Functions**: ワークフローの管理
- **Amazon EventBridge**: 定期実行のスケジューリング
- **Amazon S3**: ファイルストレージ
- **Amazon Polly**: 音声合成
- **AWS Secrets Manager**: API キーの管理

## プロジェクト構成

```
youtube-auto-video-generator/
├── infrastructure/                         # AWS CDK によるインフラコード
├── src/                                    # Lambda 関数のソースコード
├── .github/                                # GitHub Actions ワークフロー
└── docs/                                   # ドキュメント
```

## セットアップ

詳細なセットアップ手順については、`VideoGenerationPlan.md` を参照してください。

## 開発

このプロジェクトは GitHub Copilot エージェント機能を活用した自動ビルド・デプロイに対応しています。

## ライセンス

MIT License
