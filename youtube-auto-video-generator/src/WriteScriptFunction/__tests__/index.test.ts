import { Context, APIGatewayProxyEvent } from 'aws-lambda';

// Mock external modules first
jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn(() => ({
    getSecretValue: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({
          type: 'service_account',
          project_id: 'test-project',
          private_key_id: 'test-key-id',
          private_key: 'test-private-key',
          client_email: 'test@test.iam.gserviceaccount.com',
          client_id: 'test-client-id',
        }),
      }),
    }),
  })),
  S3: jest.fn(() => ({
    putObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        ETag: 'fake-etag',
      }),
    }),
  })),
}));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
    sheets: jest.fn().mockImplementation(() => ({
      spreadsheets: {
        values: {
          update: jest.fn().mockResolvedValue({
            data: {
              updatedRows: 1,
              updatedColumns: 6,
              updatedCells: 6,
            },
          }),
        },
      },
    })),
  },
}));

// Now import everything else
import { handler } from '../index';

describe('WriteScriptFunction', () => {
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      functionVersion: '1',
      memoryLimitInMB: '512',
      getRemainingTimeInMillis: () => 30000,
    } as Context;

    // Set environment variables
    process.env.GOOGLE_CREDENTIALS_SECRET_NAME = 'test-secret';
    process.env.S3_BUCKET_NAME = 'test-bucket';
  });

  afterEach(() => {
    delete process.env.GOOGLE_CREDENTIALS_SECRET_NAME;
    delete process.env.S3_BUCKET_NAME;
  });

  test('should write script to spreadsheet and S3 successfully', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        rowData: {
          row: 2,
          prompt: '動画プロンプト1',
          videoTheme: 'エンターテイメント',
          duration: 60,
        },
        generatedScript: {
          title: 'テスト動画のタイトル',
          description: 'テスト動画の説明文',
          script: 'これはテスト用の台本です。',
          imagePrompts: ['A beautiful landscape', 'A city skyline'],
          tags: ['テスト', '動画', 'AI'],
          estimatedDuration: 60,
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.updatedRow).toBe(2);
    expect(body.scriptFileUrl).toContain('s3://test-bucket/scripts/');
    expect(body.message).toContain('Successfully wrote script');
  });

  test('should handle missing environment variables', async () => {
    delete process.env.GOOGLE_CREDENTIALS_SECRET_NAME;

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        rowData: {
          row: 2,
          prompt: '動画プロンプト1',
          videoTheme: 'エンターテイメント',
          duration: 60,
        },
        generatedScript: {
          title: 'テスト動画のタイトル',
          description: 'テスト動画の説明文',
          script: 'これはテスト用の台本です。',
          imagePrompts: ['A beautiful landscape'],
          tags: ['テスト'],
          estimatedDuration: 60,
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('GOOGLE_CREDENTIALS_SECRET_NAME environment variable is required');
  });

  test('should handle invalid input', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        // Missing required fields
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Invalid input');
  });

  test('should handle empty request body', async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Request body is required');
  });

  test('should handle Google Sheets API errors', async () => {
    // Mock Google Sheets API error
    const { google } = require('googleapis');
    const mockSheets = google.sheets();
    mockSheets.spreadsheets.values.update.mockRejectedValue(new Error('Google Sheets API error'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        rowData: {
          row: 2,
          prompt: '動画プロンプト1',
          videoTheme: 'エンターテイメント',
          duration: 60,
        },
        generatedScript: {
          title: 'テスト動画のタイトル',
          description: 'テスト動画の説明文',
          script: 'これはテスト用の台本です。',
          imagePrompts: ['A beautiful landscape'],
          tags: ['テスト'],
          estimatedDuration: 60,
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Google Sheets API error');
  });

  test('should handle S3 upload errors', async () => {
    // Mock S3 to throw an error
    const AWS = require('aws-sdk');
    const mockS3 = new AWS.S3();
    mockS3.putObject.mockReturnValue({
      promise: jest.fn().mockRejectedValue(new Error('S3 upload error')),
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        rowData: {
          row: 2,
          prompt: '動画プロンプト1',
          videoTheme: 'エンターテイメント',
          duration: 60,
        },
        generatedScript: {
          title: 'テスト動画のタイトル',
          description: 'テスト動画の説明文',
          script: 'これはテスト用の台本です。',
          imagePrompts: ['A beautiful landscape'],
          tags: ['テスト'],
          estimatedDuration: 60,
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('S3 upload error');
  });

  test('should validate required script fields', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        rowData: {
          row: 2,
          prompt: '動画プロンプト1',
          videoTheme: 'エンターテイメント',
          duration: 60,
        },
        generatedScript: {
          // Missing required fields like title, script, etc.
          description: 'テスト動画の説明文',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Missing required script fields');
  });

  test('should update status to SCRIPT_GENERATED', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        rowData: {
          row: 2,
          prompt: '動画プロンプト1',
          videoTheme: 'エンターテイメント',
          duration: 60,
        },
        generatedScript: {
          title: 'テスト動画のタイトル',
          description: 'テスト動画の説明文',
          script: 'これはテスト用の台本です。',
          imagePrompts: ['A beautiful landscape'],
          tags: ['テスト'],
          estimatedDuration: 60,
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    await handler(event, mockContext);

    const { google } = require('googleapis');
    const mockSheets = google.sheets();
    expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: 'test-spreadsheet-id',
      range: 'Sheet1!A2:F2',
      valueInputOption: 'USER_ENTERED',
      values: [
        [
          '動画プロンプト1',
          'エンターテイメント',
          60,
          'テスト動画のタイトル',
          'SCRIPT_GENERATED',
          expect.stringContaining('s3://test-bucket/scripts/'),
        ],
      ],
    });
  });
});
