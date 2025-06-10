import { Context, APIGatewayProxyEvent } from 'aws-lambda';
import axios from 'axios';

// Mock external modules first
jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn(() => ({
    getSecretValue: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        SecretString: 'fake-openai-api-key',
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

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      images: {
        generate: jest.fn().mockResolvedValue({
          data: [
            { url: 'https://fake-image-url-1.com/image1.png' },
            { url: 'https://fake-image-url-2.com/image2.png' },
          ],
        }),
      },
    })),
  };
});

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Now import everything else
import { handler } from '../index';

describe('GenerateImageFunction', () => {
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
    process.env.S3_BUCKET_NAME = 'test-bucket';

    // Mock axios.get for image download
    mockAxios.get.mockResolvedValue({
      data: Buffer.from('fake-image-data'),
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY_SECRET_NAME;
    delete process.env.S3_BUCKET_NAME;
  });

  test('should generate images successfully', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          imagePrompts: ['A beautiful sunset', 'A mountain landscape'],
          title: 'Test Video',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.images).toHaveLength(2);
    expect(body.totalImages).toBe(2);
    expect(body.images[0]).toMatchObject({
      index: 0,
      prompt: 'A beautiful sunset',
      imageUrl: 'https://fake-image-url-1.com/image1.png',
    });
  });

  test('should handle missing environment variables', async () => {
    const originalEnv = process.env.OPENAI_API_KEY_SECRET_NAME;
    delete process.env.OPENAI_API_KEY_SECRET_NAME;

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          imagePrompts: ['A beautiful sunset'],
          title: 'Test Video',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.successfulImages).toBe(0); // No images were generated due to missing env var

    // 環境変数を復元
    if (originalEnv) {
      process.env.OPENAI_API_KEY_SECRET_NAME = originalEnv;
    }
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
    expect(body.message).toContain('generatedScript.imagePrompts array is required');
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
    // 環境変数を設定してOpenAI API呼び出しまで到達させる
    process.env.OPENAI_API_KEY_SECRET_NAME = 'test-openai-secret';
    
    // Secrets Managerでエラーメッセージを含むエラーを発生させる
    const { SecretsManager } = require('aws-sdk');
    const mockSecretsManager = SecretsManager.prototype;
    const originalGetSecretValue = mockSecretsManager.getSecretValue;
    
    mockSecretsManager.getSecretValue = jest.fn().mockReturnValue({
      promise: jest.fn().mockRejectedValue(new Error('OpenAI API error: Rate limit exceeded'))
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          imagePrompts: ['A beautiful sunset'],
          title: 'Test Video',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    // モックを元に戻す
    mockSecretsManager.getSecretValue = originalGetSecretValue;
    delete process.env.OPENAI_API_KEY_SECRET_NAME;

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('OpenAI API error');
  });
});
