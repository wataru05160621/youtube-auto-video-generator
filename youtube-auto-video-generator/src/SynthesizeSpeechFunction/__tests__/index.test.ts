import { Context, APIGatewayProxyEvent } from 'aws-lambda';

// Mock external modules first
const mockPollyPromise = jest.fn();
const mockPolly = {
  synthesizeSpeech: jest.fn().mockReturnValue({
    promise: mockPollyPromise,
  }),
};

const mockS3Promise = jest.fn();
const mockS3 = {
  putObject: jest.fn().mockReturnValue({
    promise: mockS3Promise,
  }),
};

jest.mock('aws-sdk', () => ({
  Polly: jest.fn(() => mockPolly),
  S3: jest.fn(() => mockS3),
}));

// Now import everything else
import { handler } from '../index';

describe('SynthesizeSpeechFunction', () => {
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks to successful state
    mockPollyPromise.mockResolvedValue({
      AudioStream: Buffer.from('fake-audio-data'),
    });

    mockS3Promise.mockResolvedValue({
      ETag: 'fake-etag',
    });

    mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      functionVersion: '1',
      memoryLimitInMB: '512',
      getRemainingTimeInMillis: () => 30000,
    } as Context;

    // Set environment variables
    process.env.S3_BUCKET_NAME = 'test-bucket';
  });

  afterEach(() => {
    delete process.env.S3_BUCKET_NAME;
  });

  test('should synthesize speech successfully', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          script: 'これはテスト用の台本です。音声合成をテストしています。',
          title: 'テスト動画',
          estimatedDuration: 60,
        },
        executionId: 'test-execution-id',
        voiceId: 'Mizuki',
        language: 'ja-JP',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.audioFileS3Key).toContain('test-execution-id');
    expect(body.audioFileS3Url).toContain('s3://test-bucket/');
    expect(body.voiceId).toBe('Mizuki');
    expect(body.audioDuration).toBeGreaterThan(0);
  });

  test('should use default voice when invalid voice specified', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          script: 'これはテスト用の台本です。',
          title: 'テスト動画',
        },
        executionId: 'test-execution-id',
        voiceId: 'InvalidVoice',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.voiceId).toBe('Mizuki'); // Should fallback to default
  });

  test('should handle missing environment variables', async () => {
    delete process.env.S3_BUCKET_NAME;

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          script: 'これはテスト用の台本です。',
          title: 'テスト動画',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('S3_BUCKET_NAME environment variable is required');
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
    expect(body.message).toContain('Script text is required');
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

  test('should handle Polly API errors', async () => {
    // Mock Polly to throw an error
    mockPollyPromise.mockRejectedValue(new Error('Polly API error'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          script: 'これはテスト用の台本です。',
          title: 'テスト動画',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Polly API error');
  });

  test('should handle S3 upload errors', async () => {
    // Mock S3 to throw an error
    mockS3Promise.mockRejectedValue(new Error('S3 upload error'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          script: 'これはテスト用の台本です。',
          title: 'テスト動画',
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

  test('should handle empty script', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          script: '',
          title: 'テスト動画',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Script text is required');
  });

  test('should estimate audio duration correctly', async () => {
    const longScript = 'これは長いテスト用の台本です。'.repeat(20); // より長いテキストに変更

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        generatedScript: {
          script: longScript,
          title: 'テスト動画',
        },
        executionId: 'test-execution-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.audioDuration).toBeGreaterThan(10); // Should be longer for longer text
  });
});
