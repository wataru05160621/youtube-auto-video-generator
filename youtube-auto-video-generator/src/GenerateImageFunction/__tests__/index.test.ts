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
    mockOpenAI.images.generate.mockRejectedValue(new Error('OpenAI API error'));

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

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('OpenAI API error');
  });
});
