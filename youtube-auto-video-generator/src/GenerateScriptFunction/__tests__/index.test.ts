import { Context, APIGatewayProxyEvent } from 'aws-lambda';

// Mock external modules first
jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn(() => ({
    getSecretValue: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        SecretString: 'fake-openai-api-key',
      }),
    }),
  })),
}));

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'テスト動画のタイトル',
                    description: 'テスト動画の説明文です',
                    script: 'これはテスト用の台本です。',
                    imagePrompts: ['A beautiful landscape', 'A city skyline'],
                    tags: ['テスト', '動画', 'AI'],
                    estimatedDuration: 60,
                  }),
                },
              },
            ],
          }),
        },
      },
    })),
  };
});

// Now import everything else
import { handler } from '../index';

describe('GenerateScriptFunction', () => {
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
    process.env.OPENAI_API_KEY_SECRET_NAME = 'test-secret';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY_SECRET_NAME;
  });

  test('should generate script successfully', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        prompt: 'AIについての動画を作ってください',
        videoTheme: '教育',
        duration: 60,
        rowData: { row: 1 },
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.generatedScript).toBeDefined();
    expect(body.generatedScript.title).toBe('テスト動画のタイトル');
    expect(body.generatedScript.script).toBe('これはテスト用の台本です。');
    expect(body.generatedScript.imagePrompts).toHaveLength(2);
    expect(body.executionId).toBe('test-execution-id');
  });

  test('should handle missing environment variables', async () => {
    delete process.env.OPENAI_API_KEY_SECRET_NAME;

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        prompt: 'AIについての動画を作ってください',
        videoTheme: '教育',
        duration: 60,
        rowData: { row: 1 },
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('OPENAI_API_KEY_SECRET_NAME environment variable is required');
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

  test('should handle OpenAI API errors', async () => {
    // Mock OpenAI to throw an error
    const OpenAI = require('openai').default;
    const mockOpenAI = new OpenAI();
    mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI API error'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        prompt: 'AIについての動画を作ってください',
        videoTheme: '教育',
        duration: 60,
        rowData: { row: 1 },
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('OpenAI API error');
  });

  test('should handle invalid JSON response from OpenAI', async () => {
    // Mock OpenAI to return invalid JSON
    const OpenAI = require('openai').default;
    const mockOpenAI = new OpenAI();
    mockOpenAI.chat.completions.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Invalid JSON response',
          },
        },
      ],
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        prompt: 'AIについての動画を作ってください',
        videoTheme: '教育',
        duration: 60,
        rowData: { row: 1 },
        spreadsheetId: 'test-spreadsheet-id',
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Failed to parse generated script');
  });
});
