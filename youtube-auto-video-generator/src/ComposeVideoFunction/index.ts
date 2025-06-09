import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 環境変数
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME!;
const FFMPEG_PATH = process.env.FFMPEG_PATH || '/opt/ffmpeg/ffmpeg';

// S3クライアント（テストで注入可能にするため関数として作成）
export const createS3Client = () => new S3();

/**
 * Lambda関数への入力インターフェース
 */
interface ComposeVideoInput {
  imageUrls: string[];
  audioUrl: string;
  executionId: string;
  rowData?: {
    row: number;
    title: string;
    description?: string;
  };
}

/**
 * 生成された動画情報
 */
interface ComposedVideo {
  videoUrl: string;
  s3Key: string;
  s3Url: string;
  duration: number;
  fileSize: number;
}

/**
 * Lambda関数のレスポンスインターフェース
 */
interface ComposeVideoResult {
  success: boolean;
  video?: ComposedVideo;
  executionId: string;
  message: string;
}

/**
 * S3からファイルをダウンロードして一時ディレクトリに保存
 */
async function downloadFromS3(s3Url: string, localPath: string): Promise<void> {
  console.log(`Downloading ${s3Url} to ${localPath}`);

  // S3 URLから bucket と key を抽出
  const s3UrlMatch = s3Url.match(/s3:\/\/([^\/]+)\/(.+)/);
  if (!s3UrlMatch) {
    throw new Error(`Invalid S3 URL format: ${s3Url}`);
  }

  const bucket = s3UrlMatch[1];
  const key = s3UrlMatch[2];

  try {
    const s3 = createS3Client();
    const response = await s3.getObject({
      Bucket: bucket,
      Key: key,
    }).promise();

    if (!response.Body) {
      throw new Error(`No content found for ${s3Url}`);
    }

    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(localPath, response.Body as Buffer);
    console.log(`Downloaded ${s3Url} to ${localPath} (${response.ContentLength} bytes)`);
  } catch (error) {
    console.error(`Error downloading ${s3Url}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download ${s3Url}: ${errorMessage}`);
  }
}

/**
 * ファイルをS3にアップロード
 */
async function uploadToS3(localPath: string, s3Key: string): Promise<string> {
  console.log(`Uploading ${localPath} to s3://${S3_BUCKET_NAME}/${s3Key}`);

  try {
    const fileContent = fs.readFileSync(localPath);
    const stats = fs.statSync(localPath);

    const s3 = createS3Client();
    await s3.upload({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'video/mp4',
      Metadata: {
        filename: path.basename(localPath),
        fileSize: stats.size.toString(),
        uploadTime: new Date().toISOString(),
        functionName: 'ComposeVideoFunction',
      },
    }).promise();

    const s3Url = `s3://${S3_BUCKET_NAME}/${s3Key}`;
    console.log(`Uploaded to ${s3Url} (${stats.size} bytes)`);
    return s3Url;
  } catch (error) {
    console.error(`Error uploading to S3:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload to S3: ${errorMessage}`);
  }
}

/**
 * FFmpegコマンドを実行して動画を合成
 */
function composeVideoWithFFmpeg(
  imagePaths: string[],
  audioPath: string,
  outputPath: string
): void {
  console.log('Starting video composition with FFmpeg');
  console.log(`Images: ${imagePaths.join(', ')}`);
  console.log(`Audio: ${audioPath}`);
  console.log(`Output: ${outputPath}`);

  if (imagePaths.length === 0) {
    throw new Error('No image files provided');
  }

  try {
    // 各画像の表示時間を計算（音声の長さに基づいて均等分割）
    const audioDuration = getAudioDuration(audioPath);
    const imageDuration = Math.max(2, audioDuration / imagePaths.length); // 最低2秒

    console.log(`Audio duration: ${audioDuration}s, Image duration: ${imageDuration}s each`);

    // FFmpegコマンドを構築
    let ffmpegCmd = `"${FFMPEG_PATH}" -y`;

    // 各画像を入力として追加
    for (const imagePath of imagePaths) {
      ffmpegCmd += ` -loop 1 -t ${imageDuration} -i "${imagePath}"`;
    }

    // 音声ファイルを追加
    ffmpegCmd += ` -i "${audioPath}"`;

    // フィルター設定
    if (imagePaths.length === 1) {
      // 画像が1枚の場合
      ffmpegCmd += ` -filter_complex "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v]"`;
    } else {
      // 複数画像の場合はconcat
      let filterComplex = '';
      for (let i = 0; i < imagePaths.length; i++) {
        filterComplex += `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v${i}];`;
      }
      filterComplex += imagePaths.map((_, i) => `[v${i}]`).join('') + `concat=n=${imagePaths.length}:v=1:a=0,format=yuv420p[v]`;
      ffmpegCmd += ` -filter_complex "${filterComplex}"`;
    }

    // 出力設定
    ffmpegCmd += ` -map "[v]" -map ${imagePaths.length}:a -c:v libx264 -c:a aac -shortest "${outputPath}"`;

    console.log('Executing FFmpeg command:', ffmpegCmd);

    // コマンド実行
    const result = execSync(ffmpegCmd, {
      encoding: 'utf8',
      timeout: 300000, // 5分タイムアウト
      maxBuffer: 1024 * 1024 * 10 // 10MB バッファ
    });

    console.log('FFmpeg output:', result);

    // 出力ファイルの存在確認
    if (!fs.existsSync(outputPath)) {
      throw new Error('Output video file was not created');
    }

    const stats = fs.statSync(outputPath);
    console.log(`Video composition completed. Output file size: ${stats.size} bytes`);

  } catch (error) {
    console.error('FFmpeg execution failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Video composition failed: ${errorMessage}`);
  }
}

/**
 * 音声ファイルの長さを取得
 */
function getAudioDuration(audioPath: string): number {
  try {
    const cmd = `"${FFMPEG_PATH}" -i "${audioPath}" 2>&1 | grep "Duration" | awk '{print $2}' | tr -d ','`;
    const durationStr = execSync(cmd, { encoding: 'utf8' }).trim();

    if (!durationStr) {
      console.warn('Could not determine audio duration, using default 60 seconds');
      return 60;
    }

    // Duration形式: HH:MM:SS.mmm
    const parts = durationStr.split(':');
    if (parts.length !== 3) {
      console.warn(`Invalid duration format: ${durationStr}, using default 60 seconds`);
      return 60;
    }

    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parseFloat(parts[2]);

    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    console.log(`Audio duration: ${totalSeconds} seconds`);
    return totalSeconds;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Error getting audio duration:', errorMessage);
    return 60; // デフォルト値
  }
}

/**
 * 動画の詳細情報を取得
 */
function getVideoInfo(videoPath: string): { duration: number; fileSize: number } {
  try {
    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;

    // FFprobeで動画の長さを取得
    const cmd = `"${FFMPEG_PATH.replace('ffmpeg', 'ffprobe')}" -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`;
    const durationStr = execSync(cmd, { encoding: 'utf8' }).trim();
    const duration = parseFloat(durationStr) || 60;

    return { duration, fileSize };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Error getting video info:', errorMessage);
    return { duration: 60, fileSize: 0 };
  }
}

/**
 * 一時ファイルをクリーンアップ
 */
function cleanupTempFiles(files: string[]): void {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Cleaned up temp file: ${file}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to cleanup ${file}:`, errorMessage);
    }
  }
}

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('ComposeVideoFunction started', {
    event: JSON.stringify(event, null, 2),
    context: JSON.stringify(context, null, 2),
  });

  const tempFiles: string[] = [];
  let input: ComposeVideoInput | undefined;

  try {
    // 入力データの解析
    if (typeof event.body === 'string') {
      input = JSON.parse(event.body);
    } else {
      input = event as any;
    }

    // 必須フィールドの検証
    if (!input || !input.imageUrls || !Array.isArray(input.imageUrls) || input.imageUrls.length === 0) {
      throw new Error('imageUrls array is required and must not be empty');
    }

    if (!input.audioUrl) {
      throw new Error('audioUrl is required');
    }

    if (!input.executionId) {
      throw new Error('executionId is required');
    }

    console.log(`Processing ${input.imageUrls.length} images and 1 audio file`);

    // 一時ディレクトリの準備
    const tempDir = '/tmp/video-composition';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 画像ファイルをダウンロード
    const imagePaths: string[] = [];
    for (let i = 0; i < input.imageUrls.length; i++) {
      const localPath = path.join(tempDir, `image-${i}.png`);
      await downloadFromS3(input.imageUrls[i], localPath);
      imagePaths.push(localPath);
      tempFiles.push(localPath);
    }

    // 音声ファイルをダウンロード
    const audioPath = path.join(tempDir, 'audio.mp3');
    await downloadFromS3(input.audioUrl, audioPath);
    tempFiles.push(audioPath);

    // 動画を合成
    const outputPath = path.join(tempDir, 'output.mp4');
    composeVideoWithFFmpeg(imagePaths, audioPath, outputPath);
    tempFiles.push(outputPath);

    // 動画情報を取得
    const videoInfo = getVideoInfo(outputPath);

    // S3にアップロード
    const s3Key = `videos/video-${input.executionId}.mp4`;
    const s3Url = await uploadToS3(outputPath, s3Key);

    const video: ComposedVideo = {
      videoUrl: `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`,
      s3Key,
      s3Url,
      duration: videoInfo.duration,
      fileSize: videoInfo.fileSize,
    };

    const result: ComposeVideoResult = {
      success: true,
      video,
      executionId: input.executionId,
      message: `Video composed successfully from ${input.imageUrls.length} images and audio`,
    };

    console.log('ComposeVideoFunction completed successfully', {
      videoSize: videoInfo.fileSize,
      videoDuration: videoInfo.duration,
      s3Key,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('ComposeVideoFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: ComposeVideoResult = {
      success: false,
      executionId: input?.executionId || context.awsRequestId,
      message: `Failed to compose video: ${errorMessage}`,
    };

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorResult),
    };
  } finally {
    // 一時ファイルのクリーンアップ
    cleanupTempFiles(tempFiles);
  }
}
