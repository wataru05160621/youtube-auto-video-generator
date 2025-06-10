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
          get: jest.fn().mockResolvedValue({
            data: {
              values: [
                ['動画プロンプト1', 'エンターテイメント', '60', '', 'TODO'],
                ['動画プロンプト2', '教育', '90', '', ''],
                ['動画プロンプト3', 'ビジネス', '120', '', 'COMPLETED'],
              ],
            },
          }),
          update: jest.fn().mockResolvedValue({
            data: {
              updatedRows: 1,
            },
          }),
        },
      },
    })),
  },
}));

// Now import everything else
import { handler } from '../index';

describe('ReadSpreadsheetFunction', () => {
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
  });

  afterEach(() => {
    delete process.env.GOOGLE_CREDENTIALS_SECRET_NAME;
  });

  test('should read unprocessed row successfully', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasData).toBe(true);
    expect(body.rowData).toMatchObject({
      row: 2,
      prompt: '動画プロンプト1',
      videoTheme: 'エンターテイメント',
      duration: 60,
      status: 'TODO',
    });
    expect(body.spreadsheetId).toBe('test-spreadsheet-id');
    expect(body.executionId).toBe('test-execution-id');
  });

  test('should handle missing environment variables', async () => {
    const originalEnv = process.env.GOOGLE_CREDENTIALS_SECRET_NAME;
    delete process.env.GOOGLE_CREDENTIALS_SECRET_NAME;

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('GOOGLE_CREDENTIALS_SECRET_NAME environment variable is required');

    // 環境変数を復元
    if (originalEnv) {
      process.env.GOOGLE_CREDENTIALS_SECRET_NAME = originalEnv;
    }
  });

  test('should handle invalid input', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        // Missing required spreadsheetId
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Spreadsheet ID is required');
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

  test('should handle empty spreadsheet', async () => {
    // Mock empty spreadsheet response
    const { google } = require('googleapis');
    const mockSheets = google.sheets();
    mockSheets.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: null,
      },
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasData).toBe(false);
    expect(body.rowData).toBeUndefined();
  });

  test('should handle Google Sheets API errors', async () => {
    // Mock Google Sheets API error
    const { google } = require('googleapis');
    const mockSheets = google.sheets();
    mockSheets.spreadsheets.values.get.mockRejectedValue(new Error('Google Sheets API error'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Google Sheets API error');
  });

  test('should find next available row with empty status', async () => {
    // Mock spreadsheet with mixed statuses
    const { google } = require('googleapis');
    const mockSheets = google.sheets();
    mockSheets.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [
          ['動画プロンプト1', 'エンターテイメント', '60', '', 'PROCESSING'],
          ['動画プロンプト2', '教育', '90', '', ''], // This should be picked
          ['動画プロンプト3', 'ビジネス', '120', '', 'COMPLETED'],
        ],
      },
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasData).toBe(true);
    expect(body.rowData.row).toBe(3); // Should pick the second row (3rd in 1-based)
    expect(body.rowData.prompt).toBe('動画プロンプト2');
  });
});
