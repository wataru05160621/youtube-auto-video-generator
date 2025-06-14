#!/usr/bin/env python3
"""
API設定ガイド - 段階的セットアップ
YouTube自動動画生成システムの外部API設定手順
"""

print("🚀 YouTube自動動画生成システム - API設定ガイド")
print("=" * 60)

print("\n📋 設定手順（推奨順序）")
print("-" * 40)

steps = [
    {
        "step": 1,
        "title": "OpenAI APIキー設定",
        "priority": "🔴 高優先度",
        "description": "スクリプト生成と画像生成に必要",
        "command": "./setup-openai-api-key.sh \"sk-proj-xxxxxxxxxx\"",
        "url": "https://platform.openai.com/api-keys",
        "cost": "従量制（$20クレジットで多数のテスト可能）"
    },
    {
        "step": 2,
        "title": "Google Sheets API設定",
        "priority": "🟡 中優先度",
        "description": "スプレッドシート読み込み・書き込みに必要",
        "command": "./setup-google-sheets-api.sh ./service-account.json",
        "url": "https://console.cloud.google.com/apis/credentials",
        "cost": "無料（クォータ内）"
    },
    {
        "step": 3,
        "title": "YouTube API設定",
        "priority": "🟢 低優先度",
        "description": "動画アップロード用（テスト段階では不要）",
        "command": "./setup-youtube-api.sh \"client_id\" \"client_secret\"",
        "url": "https://console.cloud.google.com/apis/credentials",
        "cost": "無料（クォータ内）"
    }
]

for step in steps:
    print(f"\n{step['step']}. {step['title']} {step['priority']}")
    print(f"   目的: {step['description']}")
    print(f"   設定: {step['command']}")
    print(f"   取得: {step['url']}")
    print(f"   費用: {step['cost']}")

print("\n🎯 最小限での動作確認")
print("-" * 40)
print("1. OpenAI APIキーのみ設定すれば、スクリプト・画像生成をテストできます")
print("2. Google Sheets APIを追加すれば、スプレッドシート連携をテストできます")
print("3. YouTube APIは最後に設定（プレースホルダー実装で動作確認済み）")

print("\n📊 設定後のテスト手順")
print("-" * 40)
print("1. ./check-api-config.sh で設定状況確認")
print("2. python3 test-lambda.py で個別関数テスト")
print("3. Step Functions統合テストの実行")

print("\n💡 テスト用のスプレッドシート作成方法")
print("-" * 40)
print("1. Google Sheetsで新しいスプレッドシートを作成")
print("2. 以下の列構造を作成:")

headers = ["A列: タイトル", "B列: テーマ", "C列: 対象者", "D列: スクリプト", "E列: ステータス"]
for i, header in enumerate(headers, 1):
    print(f"   {header}")

print("\n3. サンプルデータ:")
sample_data = [
    ["AI入門講座", "人工知能の基礎", "初心者", "", "pending"],
    ["プログラミング始め方", "プログラミング学習", "学生", "", "pending"]
]

for i, row in enumerate(sample_data, 2):
    print(f"   {i}行目: {' | '.join(row)}")

print("\n4. サービスアカウントに編集権限を付与")
print("   （Google Sheets API設定時に表示されるメールアドレス）")

print("\n🔧 トラブルシューティング")
print("-" * 40)
print("• OpenAI APIエラー → APIキーとクレジット残高を確認")
print("• Google Sheets権限エラー → サービスアカウントの共有設定を確認")
print("• Lambda関数エラー → CloudWatch Logsで詳細ログを確認")

print("\n✅ 設定完了の確認方法")
print("-" * 40)
print("全ての設定が完了したら以下のコマンドで動作確認:")
print("./check-api-config.sh")
print("")
print("🎉 準備が整ったら統合テストを実行しましょう！")
