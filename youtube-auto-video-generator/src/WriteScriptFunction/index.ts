import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManager, S3 } from 'aws-sdk';
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

const secretsManager = new SecretsManager();
const s3 = new S3();

/**
 * Google Sheets API の認証情報を取得
 */
async function getGoogleCredentials(): Promise<any> {
  const secretName = process.env.GOOGLE_CREDENTIALS_SECRET_NAME;
  if (!secretName) {
    throw new Error('GOOGLE_CREDENTIALS_SECRET_NAME environment variable is required');
  }

  try {
    const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
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
    await s3.putObject({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(generatedScript, null, 2),
      ContentType: 'application/json',
      Metadata: {
        executionId,
        timestamp: new Date().toISOString(),
        functionName: 'WriteScriptFunction',
      },
    }).promise();

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
  generatedScript: any,
  scriptFileUrl: string
): Promise<void> {
  const sheets = await initializeSheetsClient();

  try {
    // 更新するデータを準備
    const values = [
      [
        '', // A列（プロンプト）- 既存値を維持
        '', // B列（ビデオテーマ）- 既存値を維持
        '', // C列（時間）- 既存値を維持
        generatedScript.title, // D列 - 生成されたタイトル
        'Processing', // E列 - ステータス
        generatedScript.description, // F列 - 説明
        generatedScript.script.substring(0, 1000), // G列 - 台本（制限）
        generatedScript.tags.join(', '), // H列 - タグ
        scriptFileUrl, // I列 - S3ファイルURL
        new Date().toISOString(), // J列 - 更新日時
      ],
    ];

    // D列からJ列までを更新（A-C列は既存値を保持）
    const range = `Sheet1!D${row}:J${row}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
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
      input.generatedScript,
      scriptFileUrl
    );

    const result: WriteScriptResult = {
      success: true,
      updatedRow: input.rowData.row,
      scriptFileUrl,
      message: 'Script written successfully to spreadsheet and S3',
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
