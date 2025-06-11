import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

// 環境変数
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME!;
const SECRETS_NAME = process.env.SECRETS_NAME!;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

// AWSクライアント
export const createS3Client = () => new S3Client();
export const createSecretsManagerClient = () => new SecretsManagerClient();
export const createSNSClient = () => new SNSClient();

/**
 * Lambda関数への入力インターフェース
 */
interface UploadToYouTubeInput {
  video: {
    videoUrl: string;
    s3Key: string;
    s3Url: string;
    duration: number;
    fileSize: number;
  };
  executionId: string;
  rowData?: {
    row: number;
    title: string;
    description?: string;
  };
  generatedScript?: {
    title: string;
    description: string;
    tags: string[];
  };
}

/**
 * YouTube認証情報インターフェース
 */
interface YouTubeCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * Google Sheets認証情報インターフェース
 */
interface GoogleSheetsCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * アップロードされた動画情報
 */
interface UploadedVideo {
  videoId: string;
  videoUrl: string;
  title: string;
  description: string;
  privacyStatus: string;
  uploadedAt: string;
}

/**
 * Lambda関数のレスポンスインターフェース
 */
interface UploadToYouTubeResult {
  success: boolean;
  video?: UploadedVideo;
  executionId: string;
  rowUpdated?: boolean;
  message: string;
}

/**
 * Secrets Managerからシークレットを取得
 */
async function getSecret(secretName: string): Promise<any> {
  try {
    console.log(`Getting secret: ${secretName}`);
    const secretsManager = createSecretsManagerClient();
    const result = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretName }));

    if (!result.SecretString) {
      throw new Error(`Secret ${secretName} has no SecretString`);
    }

    return JSON.parse(result.SecretString);
  } catch (error) {
    console.error(`Error getting secret ${secretName}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get secret ${secretName}: ${errorMessage}`);
  }
}

/**
 * YouTube認証情報を取得
 */
async function getYouTubeCredentials(): Promise<YouTubeCredentials> {
  const secrets = await getSecret(SECRETS_NAME);

  const credentials: YouTubeCredentials = {
    client_id: secrets.youtube_client_id,
    client_secret: secrets.youtube_client_secret,
    refresh_token: secrets.youtube_refresh_token,
  };

  if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
    throw new Error('Missing YouTube credentials in secrets');
  }

  return credentials;
}

/**
 * Google Sheets認証情報を取得
 */
async function getGoogleSheetsCredentials(): Promise<GoogleSheetsCredentials> {
  const secrets = await getSecret(SECRETS_NAME);

  const credentials: GoogleSheetsCredentials = {
    client_id: secrets.google_client_id,
    client_secret: secrets.google_client_secret,
    refresh_token: secrets.google_refresh_token,
  };

  if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
    throw new Error('Missing Google Sheets credentials in secrets');
  }

  return credentials;
}

/**
 * OAuth2クライアントを作成
 */
function createOAuth2Client(credentials: YouTubeCredentials | GoogleSheetsCredentials): OAuth2Client {
  const oauth2Client = new OAuth2Client(
    credentials.client_id,
    credentials.client_secret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({
    refresh_token: credentials.refresh_token,
  });

  return oauth2Client;
}

/**
 * S3から動画ファイルをダウンロード
 */
async function downloadVideoFromS3(s3Url: string, localPath: string): Promise<void> {
  console.log(`Downloading video from ${s3Url} to ${localPath}`);

  // S3 URLから bucket と key を抽出
  const s3UrlMatch = s3Url.match(/s3:\/\/([^\/]+)\/(.+)/);
  if (!s3UrlMatch) {
    throw new Error(`Invalid S3 URL format: ${s3Url}`);
  }

  const bucket = s3UrlMatch[1];
  const key = s3UrlMatch[2];

  try {
    const s3 = createS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await s3.send(command);

    if (!response.Body) {
      throw new Error(`No content found for ${s3Url}`);
    }

    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const stream = response.Body as Readable;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const bodyBuffer = Buffer.concat(chunks);
    fs.writeFileSync(localPath, bodyBuffer);
    console.log(`Downloaded video: ${response.ContentLength} bytes`);
  } catch (error) {
    console.error(`Error downloading video from S3:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download video: ${errorMessage}`);
  }
}

/**
 * YouTubeに動画をアップロード
 */
async function uploadToYouTube(
  filePath: string,
  title: string,
  description: string,
  tags: string[] = [],
  privacyStatus: 'public' | 'unlisted' | 'private' = 'unlisted'
): Promise<UploadedVideo> {
  console.log('Starting YouTube upload');
  console.log(`Title: ${title}`);
  console.log(`Description length: ${description.length}`);
  console.log(`Tags: ${tags.join(', ')}`);
  console.log(`Privacy: ${privacyStatus}`);

  try {
    const credentials = await getYouTubeCredentials();
    const oauth2Client = createOAuth2Client(credentials);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client as any });

    const requestBody: youtube_v3.Schema$Video = {
      snippet: {
        title: title.substring(0, 100), // YouTubeのタイトル制限
        description: description.substring(0, 5000), // YouTubeの説明文制限
        tags: tags.slice(0, 500), // YouTubeのタグ制限
        categoryId: '22', // People & Blogs
        defaultLanguage: 'ja',
        defaultAudioLanguage: 'ja',
      },
      status: {
        privacyStatus,
        embeddable: true,
        license: 'youtube',
        publicStatsViewable: true,
      },
    };

    const fileSize = fs.statSync(filePath).size;
    console.log(`Uploading video file: ${fileSize} bytes`);

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody,
      media: {
        body: fs.createReadStream(filePath),
      },
    });

    if (!response.data.id) {
      throw new Error('YouTube upload failed: no video ID returned');
    }

    const videoId = response.data.id;
    const videoUrl = `https://youtu.be/${videoId}`;
    const uploadedAt = new Date().toISOString();

    console.log(`Video uploaded successfully: ${videoUrl}`);

    return {
      videoId,
      videoUrl,
      title: response.data.snippet?.title || title,
      description: response.data.snippet?.description || description,
      privacyStatus: response.data.status?.privacyStatus || privacyStatus,
      uploadedAt,
    };
  } catch (error) {
    console.error('YouTube upload failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`YouTube upload failed: ${errorMessage}`);
  }
}

/**
 * スプレッドシートを更新
 */
async function updateSpreadsheet(
  rowNumber: number,
  videoUrl: string,
  status: string = 'Done'
): Promise<void> {
  console.log(`Updating spreadsheet row ${rowNumber} with video URL and status`);

  try {
    const credentials = await getGoogleSheetsCredentials();
    const oauth2Client = createOAuth2Client(credentials);

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client as any });

    // 動画URLとステータスを更新
    const updates = [
      {
        range: `Sheet1!F${rowNumber}`, // Video URL列
        values: [[videoUrl]],
      },
      {
        range: `Sheet1!A${rowNumber}`, // Status列
        values: [[status]],
      },
    ];

    for (const update of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: update.range,
        valueInputOption: 'RAW',
        requestBody: {
          values: update.values,
        },
      });
    }

    console.log(`Spreadsheet updated successfully for row ${rowNumber}`);
  } catch (error) {
    console.error('Error updating spreadsheet:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to update spreadsheet: ${errorMessage}`);
  }
}

/**
 * SNS通知を送信
 */
async function sendNotification(message: string, subject: string): Promise<void> {
  if (!SNS_TOPIC_ARN) {
    console.log('SNS topic not configured, skipping notification');
    return;
  }

  try {
    const sns = createSNSClient();
    const command = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: subject,
      Message: message,
    });
    await sns.send(command);

    console.log('SNS notification sent successfully');
  } catch (error) {
    console.error('Error sending SNS notification:', error);
    // エラーでも処理は継続
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
  console.log('UploadToYouTubeFunction started', {
    event: JSON.stringify(event, null, 2),
    context: JSON.stringify(context, null, 2),
  });

  const tempFiles: string[] = [];
  let input: UploadToYouTubeInput | undefined;

  try {
    // 入力データの解析
    if (typeof event.body === 'string') {
      input = JSON.parse(event.body);
    } else {
      input = event as any;
    }

    // 必須フィールドの検証
    if (!input || !input.video?.s3Url) {
      throw new Error('video.s3Url is required');
    }

    if (!input.executionId) {
      throw new Error('executionId is required');
    }

    // タイトルと説明文の設定
    const title = input.generatedScript?.title || input.rowData?.title || 'Auto Generated Video';
    const description = input.generatedScript?.description || input.rowData?.description || 'This video was automatically generated.';
    const tags = input.generatedScript?.tags || ['自動生成', 'AI', 'YouTube'];

    console.log(`Processing video upload for execution ${input.executionId}`);

    // 一時ディレクトリの準備
    const tempDir = '/tmp/youtube-upload';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 動画ファイルをダウンロード
    const videoPath = path.join(tempDir, `video-${input.executionId}.mp4`);
    await downloadVideoFromS3(input.video.s3Url, videoPath);
    tempFiles.push(videoPath);

    // YouTubeにアップロード
    const uploadedVideo = await uploadToYouTube(
      videoPath,
      title,
      description,
      tags,
      'unlisted' // デフォルトは限定公開
    );

    // スプレッドシートを更新（行番号がある場合）
    let rowUpdated = false;
    if (input.rowData?.row) {
      await updateSpreadsheet(input.rowData.row, uploadedVideo.videoUrl);
      rowUpdated = true;
    }

    // 成功通知を送信
    if (SNS_TOPIC_ARN) {
      const notificationMessage = `
動画が正常にYouTubeにアップロードされました：

タイトル: ${uploadedVideo.title}
URL: ${uploadedVideo.videoUrl}
プライバシー設定: ${uploadedVideo.privacyStatus}
アップロード日時: ${uploadedVideo.uploadedAt}
実行ID: ${input.executionId}
      `.trim();

      await sendNotification(notificationMessage, 'YouTube 動画アップロード完了');
    }

    const result: UploadToYouTubeResult = {
      success: true,
      video: uploadedVideo,
      executionId: input.executionId,
      rowUpdated,
      message: `Video uploaded successfully to YouTube: ${uploadedVideo.videoUrl}`,
    };

    console.log('UploadToYouTubeFunction completed successfully', {
      videoId: uploadedVideo.videoId,
      videoUrl: uploadedVideo.videoUrl,
      rowUpdated,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('UploadToYouTubeFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // エラー通知を送信
    if (SNS_TOPIC_ARN) {
      const errorNotificationMessage = `
YouTube動画アップロードが失敗しました：

エラー: ${errorMessage}
実行ID: ${input?.executionId || context.awsRequestId}
タイムスタンプ: ${new Date().toISOString()}
      `.trim();

      try {
        await sendNotification(errorNotificationMessage, 'YouTube 動画アップロード失敗');
      } catch (notificationError) {
        console.error('Failed to send error notification:', notificationError);
      }
    }

    const errorResult: UploadToYouTubeResult = {
      success: false,
      executionId: input?.executionId || context.awsRequestId,
      rowUpdated: false,
      message: `Failed to upload video to YouTube: ${errorMessage}`,
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
