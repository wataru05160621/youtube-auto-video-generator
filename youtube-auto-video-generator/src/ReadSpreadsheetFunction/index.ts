import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManager } from 'aws-sdk';
import { google } from 'googleapis';

interface SpreadsheetRow {
  row: number;
  prompt: string;
  videoTheme: string;
  duration: number;
  status: string;
  metadata?: any;
}

interface ReadSpreadsheetResult {
  hasData: boolean;
  success?: boolean;
  rowData?: SpreadsheetRow;
  spreadsheetId?: string;
  executionId: string;
  error?: string;
}

const secretsManager = new SecretsManager();

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
 * スプレッドシートから未処理の行を取得
 */
async function readUnprocessedRow(spreadsheetId: string): Promise<SpreadsheetRow | null> {
  const sheets = await initializeSheetsClient();

  try {
    // スプレッドシートの範囲を指定（例: A2:F1000）
    const range = 'Sheet1!A2:F1000';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('No data found in spreadsheet');
      return null;
    }

    // ステータス列が空白または'TODO'の最初の行を検索
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const status = row[4] || ''; // E列（ステータス列）

      if (status === '' || status.toUpperCase() === 'TODO') {
        // 必要なデータが揃っているかチェック
        const prompt = row[0] || '';
        const videoTheme = row[1] || '';
        const duration = parseInt(row[2] || '60', 10);

        if (prompt.trim() === '' || videoTheme.trim() === '') {
          console.log(`Row ${i + 2}: Missing required data (prompt or videoTheme)`);
          continue;
        }

        return {
          row: i + 2, // Excelの行番号（1-based）
          prompt: prompt.trim(),
          videoTheme: videoTheme.trim(),
          duration: duration || 60,
          status: status,
          metadata: {
            originalRow: row,
            timestamp: new Date().toISOString(),
          },
        };
      }
    }

    console.log('No unprocessed rows found');
    return null;
  } catch (error) {
    console.error('Error reading spreadsheet:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read spreadsheet: ${errorMessage}`);
  }
}

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('ReadSpreadsheetFunction started', {
    event: JSON.stringify(event, null, 2),
    context: JSON.stringify(context, null, 2),
  });

  const executionId = context.awsRequestId;

  try {
    // リクエストボディから入力データを解析
    let input: any = {};
    
    if (event.body) {
      try {
        input = JSON.parse(event.body);
      } catch (parseError) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            hasData: false,
            success: false,
            error: 'Invalid JSON in request body',
            executionId,
          }),
        };
      }
    }
    
    // スプレッドシートIDを環境変数または入力から取得
    const spreadsheetId = input.spreadsheetId ||
      process.env.SPREADSHEET_ID ||
      event.queryStringParameters?.spreadsheetId;

    if (!spreadsheetId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hasData: false,
          success: false,
          error: 'Spreadsheet ID is required',
          executionId,
        }),
      };
    }

    console.log(`Reading spreadsheet: ${spreadsheetId}`);

    // 未処理行を取得
    const rowData = await readUnprocessedRow(spreadsheetId);

    const result: ReadSpreadsheetResult = {
      hasData: rowData !== null,
      rowData: rowData || undefined,
      spreadsheetId,
      executionId,
      success: true,
    };

    console.log('ReadSpreadsheetFunction completed successfully', result);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('ReadSpreadsheetFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult = {
      hasData: false,
      success: false,
      error: errorMessage,
      executionId,
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
