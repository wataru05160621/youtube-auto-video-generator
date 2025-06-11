#!/bin/bash

# 軽量FFmpegレイヤー作成スクリプト
# このスクリプトはLinux環境（AmazonLinux2）で実行してください

set -e

echo "Building lightweight FFmpeg for AWS Lambda..."

# 作業ディレクトリを作成
WORK_DIR="/tmp/ffmpeg-build"
LAYER_DIR="/tmp/ffmpeg-layer"
mkdir -p $WORK_DIR $LAYER_DIR

cd $WORK_DIR

# 軽量なFFmpegバイナリをダウンロード（静的リンク版）
wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz

# 展開
tar -xf ffmpeg-release-amd64-static.tar.xz

# FFmpeg実行ファイルを取得
FFMPEG_DIR=$(find . -name "ffmpeg-*-amd64-static" -type d | head -1)
cp $FFMPEG_DIR/ffmpeg $LAYER_DIR/
cp $FFMPEG_DIR/ffprobe $LAYER_DIR/

# 不要なファイルを削除してサイズを削減
cd $LAYER_DIR
strip ffmpeg ffprobe  # デバッグ情報を削除

# ファイルサイズをチェック
echo "FFmpeg binary size: $(du -h ffmpeg | cut -f1)"
echo "FFprobe binary size: $(du -h ffprobe | cut -f1)"

# Lambda Layer形式でパッケージ
mkdir -p /tmp/lambda-layer/bin
cp ffmpeg ffprobe /tmp/lambda-layer/bin/

cd /tmp/lambda-layer
zip -r /tmp/ffmpeg-lambda-layer.zip .

echo "FFmpeg Lambda layer created: /tmp/ffmpeg-lambda-layer.zip"
echo "Layer size: $(du -h /tmp/ffmpeg-lambda-layer.zip | cut -f1)"

# クリーンアップ
rm -rf $WORK_DIR $LAYER_DIR

echo "Build complete!"
