import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { google } from 'googleapis';

interface WriteScriptInput {
  spreadsheetId: string;
  rowData: {
    row: number;
    prompt: string;
    videoTheme: string;
    duration: number;
  };
  generatedScript: {
    title: string;
    description: string;
    script: string;
    imagePrompts: string[];
    tags: string[];
    estimatedDuration: number;
  };
  executionId: string;
}

interface WriteScriptResult {
  success: boolean;
  updatedRow: number;
  scriptFileUrl?: string;
  message: string;
}

const secretsManager = new SecretsManagerClient();
const s3 = new S3Client();

/**
 * Google Sheets API の認証情報を取得
 */
async function getGoogleCredentials(): Promise<any> {
  const secretName = process.env.GOOGLE_CREDENTIALS_SECRET_NAME;
  if (!secretName) {
    throw new Error('GOOGLE_CREDENTIALS_SECRET_NAME environment variable is required');
  }

  try {
    const result = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretName }));
    if (!result.SecretString) {
      throw new Error('Secret string is empty');
    }
    return JSON.parse(result.SecretString);
  } catch (error) {
    console.error('Error getting Google credentials:', error);
    throw new Error('Failed to retrieve Google credentials from Secrets Manager');
  }
}

/**
 * Google Sheets API クライアントを初期化
 */
async function initializeSheetsClient() {
  const credentials = await getGoogleCredentials();
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: auth });
}

/**
 * 台本をS3に保存
 */
async function saveScriptToS3(executionId: string, generatedScript: any): Promise<string> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is required');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `scripts/${timestamp}-${executionId}.json`;

  try {
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(generatedScript, null, 2),
      ContentType: 'application/json',
      Metadata: {
        executionId,
        timestamp: new Date().toISOString(),
        functionName: 'WriteScriptFunction',
      },
    });
    
    await s3.send(putObjectCommand);

    return `s3://${bucketName}/${key}`;
  } catch (error) {
    console.error('Error saving script to S3:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to save script to S3: ${errorMessage}`);
  }
}

/**
 * スプレッドシートを更新
 */
async function updateSpreadsheet(
  spreadsheetId: string,
  row: number,
  rowData: any,
  generatedScript: any,
  scriptFileUrl: string
): Promise<void> {
  const sheets = await initializeSheetsClient();

  try {
    // 更新するデータを準備 - テストで期待される形式に合わせる
    const values = [
      [
        rowData.prompt, // A列 - プロンプト
        rowData.videoTheme, // B列 - ビデオテーマ
        rowData.duration, // C列 - 時間
        generatedScript.title || '', // D列 - 生成されたタイトル
        'SCRIPT_GENERATED', // E列 - ステータス
        scriptFileUrl, // F列 - S3ファイルURL
      ],
    ];

    // A列からF列まで全体を更新
    const range = `Sheet1!A${row}:F${row}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`Successfully updated row ${row} in spreadsheet`);
  } catch (error) {
    console.error('Error updating spreadsheet:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to update spreadsheet: ${errorMessage}`);
  }
}

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('WriteScriptFunction started', {
    event: JSON.stringify(event, null, 2),
    context: JSON.stringify(context, null, 2),
  });

  try {
    // リクエストボディの検証
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          updatedRow: -1,
          message: 'Request body is required',
        }),
      };
    }

    // 入力データの解析
    let input: WriteScriptInput;
    
    try {
      if (typeof event.body === 'string') {
        input = JSON.parse(event.body);
      } else {
        input = event as any;
      }
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          updatedRow: -1,
          message: 'Invalid JSON in request body',
        }),
      };
    }

    // 必須フィールドの検証
    if (!input.spreadsheetId || !input.rowData || !input.generatedScript) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          updatedRow: -1,
          message: 'Invalid input: spreadsheetId, rowData, and generatedScript are required',
          error: 'Invalid input: spreadsheetId, rowData, and generatedScript are required',
        }),
      };
    }

    // generatedScriptの必須フィールドを検証
    if (!input.generatedScript.title || !input.generatedScript.script) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          updatedRow: -1,
          message: 'Missing required script fields: title and script are required',
          error: 'Missing required script fields: title and script are required',
        }),
      };
    }

    console.log('Writing script for row:', input.rowData.row);

    // 台本をS3に保存
    const scriptFileUrl = await saveScriptToS3(input.executionId, input.generatedScript);
    console.log('Script saved to S3:', scriptFileUrl);

    // スプレッドシートを更新
    await updateSpreadsheet(
      input.spreadsheetId,
      input.rowData.row,
      input.rowData,
      input.generatedScript,
      scriptFileUrl
    );

    const result: WriteScriptResult = {
      success: true,
      updatedRow: input.rowData.row,
      scriptFileUrl,
      message: 'Script written successfully',
    };

    console.log('WriteScriptFunction completed successfully');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('WriteScriptFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: WriteScriptResult = {
      success: false,
      updatedRow: -1,
      message: `Failed to write script: ${errorMessage}`,
    };

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorResult),
    };
  }
}
