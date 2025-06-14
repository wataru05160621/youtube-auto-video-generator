# YouTube自動動画生成システム 使用ガイド

## 概要

このシステムは、Google Spreadsheetに入力されたデータを基に、自動でYouTube動画を生成・アップロードするAWSサーバーレスシステムです。

## システム構成

### アーキテクチャ
- **Foundation Layer**: S3ストレージ、IAM権限、API認証情報管理
- **Infrastructure Layer**: Lambda Layers、通知システム、イベント管理
- **Application Layer**: 動画生成Lambda関数群、ワークフロー管理

### 動画生成フロー
```
1. Google Sheets読み取り → 2. AI台本生成 → 3. スプレッドシート更新
                                                      ↓
4. 並列処理: AI画像生成 + 音声合成
                                                      ↓
5. 動画合成 → 6. YouTubeアップロード
```

## 初期セットアップ

### 1. API認証情報の設定

#### Google Sheets API
```bash
cd youtube-auto-video-generator
./setup-google-sheets-api.sh path/to/service-account.json
```

#### OpenAI API
```bash
./setup-openai-api-key.sh "your-openai-api-key"
```

#### YouTube API
```bash
./setup-youtube-api.sh "client-id" "client-secret"
```

### 2. Google Spreadsheetの準備

#### 必要な列構成
| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| title | theme | target_audience | duration | keywords | status | script | description | 処理日時 |

#### 列の説明
- **title**: 動画のタイトル
- **theme**: 動画のテーマ・内容
- **target_audience**: ターゲット視聴者
- **duration**: 動画の長さ
- **keywords**: SEO用キーワード（カンマ区切り）
- **status**: 処理状況（`pending`で処理対象）
- **script**: 生成された台本（自動入力）
- **description**: 動画説明文（自動入力）
- **処理日時**: 処理完了日時（自動入力）

#### スプレッドシート権限設定
サービスアカウント（`create-movie@my-video-generator-462103.iam.gserviceaccount.com`）に編集権限を付与してください。

## 使用方法

### 手動実行

#### 1. AWS Step Functionsから実行
```bash
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:ap-northeast-1:455931011903:stateMachine:VideoGen-VideoGeneration-dev" \
  --name "manual-execution-$(date +%s)" \
  --input '{
    "spreadsheetId": "あなたのスプレッドシートID",
    "range": "A1:Z100",
    "sheetName": "Sheet1"
  }'
```

#### 2. 実行状況確認
```bash
aws stepfunctions describe-execution \
  --execution-arn "実行のARN"
```

### 自動実行（定期実行）

システムは毎日午前10時（JST）に自動実行されます。

#### 定期実行の有効化/無効化
```bash
cd infrastructure
cdk deploy VideoGen-Events-dev --app "npx ts-node bin/infrastructure/app.ts"
```

### 実行ログの確認

#### CloudWatch Logsでの確認
- Lambda関数のログ: `/aws/lambda/videogen-*-dev`
- Step Functionsの実行履歴: AWS コンソール > Step Functions

#### 実行履歴確認コマンド
```bash
aws stepfunctions get-execution-history \
  --execution-arn "実行のARN" \
  --include-execution-data
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. "Requested entity was not found" エラー
**原因**: スプレッドシートIDが正しくない、または権限がない
**解決**: 
- スプレッドシートIDを確認
- サービスアカウントに編集権限を付与

#### 2. "OpenAI API error: 401 Unauthorized"
**原因**: OpenAI APIキーが無効
**解決**: 
```bash
./setup-openai-api-key.sh "正しいAPIキー"
```

#### 3. "Function code combined with layers exceeds maximum size"
**原因**: Lambda関数のサイズが制限を超過
**解決**: 依存関係を最小化、またはContainer Imageへ移行

#### 4. 動画生成が完了しない
**原因**: 重いメディア処理でタイムアウト
**解決**: Lambda関数のタイムアウト時間を延長

### ログ確認方法

#### 各Lambda関数のログ
```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/videogen"
aws logs get-log-events --log-group-name "/aws/lambda/videogen-readspreadsheet-dev"
```

#### Step Functions実行ログ
AWS コンソール > Step Functions > 実行履歴から詳細確認

## システム制約

### 技術制約
- **Lambda関数**: 最大15分実行、メモリ3008MB上限
- **Step Functions**: 最大1年実行、状態遷移25,000回上限
- **S3**: オブジェクトサイズ5TB上限
- **動画長**: FFmpeg処理能力に依存

### API制約
- **OpenAI API**: 利用量制限あり
- **YouTube API**: 1日のアップロード制限あり
- **Google Sheets API**: 1分間に100リクエスト制限

### コスト考慮
- **Lambda実行時間**: 重い処理ほど高額
- **S3ストレージ**: 生成された動画・音声ファイル
- **API呼び出し**: OpenAI、YouTube API利用料

## メンテナンス

### 定期メンテナンス項目
1. **ログローテーション**: CloudWatch Logsの保持期間設定
2. **S3クリーンアップ**: 古い動画ファイルの削除
3. **API利用状況確認**: 制限に近づいていないかチェック
4. **セキュリティ更新**: 依存関係の更新

### システム更新
```bash
cd infrastructure
npm run build
cdk deploy --all
```

## サポート

### 問題報告
- GitHub Issues: `https://github.com/your-repo/issues`
- AWS サポート: 技術的な問題について

### 参考資料
- [AWS Step Functions ドキュメント](https://docs.aws.amazon.com/step-functions/)
- [OpenAI API ドキュメント](https://platform.openai.com/docs)
- [YouTube API ドキュメント](https://developers.google.com/youtube/v3)
- [Google Sheets API ドキュメント](https://developers.google.com/sheets/api)

---

**注意**: このシステムは学習・実験目的で作成されています。商用利用する場合は、各APIの利用規約を確認し、適切なライセンスを取得してください。