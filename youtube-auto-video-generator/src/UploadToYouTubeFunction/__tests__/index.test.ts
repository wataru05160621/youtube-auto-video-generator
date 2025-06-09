import { Context, APIGatewayProxyEvent } from 'aws-lambda';
import * as fs from 'fs';

// Mock AWS SDK and Google APIs at module level
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    getObject: jest.fn(() => ({
      promise: jest.fn().mockResolvedValue({
        Body: Buffer.from('fake-video-content'),
        ContentLength: 10240000, // 10MB
      }),
    })),
  })),
  SecretsManager: jest.fn(() => ({
    getSecretValue: jest.fn(() => ({
      promise: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({
          youtube_client_id: 'test-youtube-client-id',
          youtube_client_secret: 'test-youtube-client-secret',
          youtube_refresh_token: 'test-youtube-refresh-token',
          google_client_id: 'test-google-client-id',
          google_client_secret: 'test-google-client-secret',
          google_refresh_token: 'test-google-refresh-token',
        }),
      }),
    })),
  })),
  SNS: jest.fn(() => ({
    publish: jest.fn(() => ({
      promise: jest.fn().mockResolvedValue({ MessageId: 'test-message-id' }),
    })),
  })),
}));

jest.mock('googleapis', () => ({
  google: {
    youtube: jest.fn(() => ({
      videos: {
        insert: jest.fn().mockResolvedValue({
          data: {
            id: 'test-video-id',
            snippet: {
              title: 'Test Video Title',
              description: 'Test Video Description',
            },
            status: {
              privacyStatus: 'unlisted',
            },
          },
        }),
      },
    })),
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: {
          update: jest.fn().mockResolvedValue({
            data: {
              updatedCells: 1,
            },
          }),
        },
      },
    })),
    auth: {
      OAuth2: jest.fn(() => ({
        setCredentials: jest.fn(),
        generateAccessToken: jest.fn().mockResolvedValue({ token: 'test-access-token' }),
      })),
    },
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  createReadStream: jest.fn(() => ({
    pipe: jest.fn(),
    on: jest.fn(),
  })),
  statSync: jest.fn(() => ({
    size: 10240000, // 10MB
  })),
  unlinkSync: jest.fn(),
}));

// Import the handler after mocking
import { handler } from '../index';

describe('UploadToYouTubeFunction', () => {
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      functionVersion: '1',
      memoryLimitInMB: '1024',
      getRemainingTimeInMillis: () => 60000,
    } as Context;

    // Environment variables
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.SECRETS_NAME = 'test-secrets';
    process.env.SPREADSHEET_ID = 'test-spreadsheet-id';
    process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';
  });

  afterEach(() => {
    delete process.env.S3_BUCKET_NAME;
    delete process.env.SECRETS_NAME;
    delete process.env.SPREADSHEET_ID;
    delete process.env.SNS_TOPIC_ARN;
  });

  describe('YouTube Upload', () => {
    it('should successfully upload video to YouTube', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          video: {
            videoUrl: 'https://test-bucket.s3.amazonaws.com/videos/video-test.mp4',
            s3Key: 'videos/video-test.mp4',
            s3Url: 's3://test-bucket/videos/video-test.mp4',
            duration: 60,
            fileSize: 10240000,
          },
          executionId: 'test-execution-123',
          rowData: {
            row: 4,
            title: 'Test Video',
            description: 'Test Description',
          },
          generatedScript: {
            title: 'Generated Title',
            description: 'Generated Description',
            tags: ['test', 'video', 'generated'],
          },
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.video).toBeDefined();
      expect(responseBody.video.videoId).toBe('test-video-id');
      expect(responseBody.video.videoUrl).toBe('https://youtu.be/test-video-id');
      expect(responseBody.rowUpdated).toBe(true);
    });

    it('should handle missing video data', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          executionId: 'test-execution-123',
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toContain('video.s3Url is required');
    });

    it('should handle missing execution ID', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          video: {
            videoUrl: 'https://test-bucket.s3.amazonaws.com/videos/video-test.mp4',
            s3Key: 'videos/video-test.mp4',
            s3Url: 's3://test-bucket/videos/video-test.mp4',
            duration: 60,
            fileSize: 10240000,
          },
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toContain('executionId is required');
    });

    it('should handle Secrets Manager errors', async () => {
      // Mock Secrets Manager to throw an error
      const { SecretsManager } = require('aws-sdk');
      SecretsManager.mockImplementation(() => ({
        getSecretValue: jest.fn(() => ({
          promise: jest.fn().mockRejectedValue(new Error('Secrets access denied')),
        })),
      }));

      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          video: {
            videoUrl: 'https://test-bucket.s3.amazonaws.com/videos/video-test.mp4',
            s3Key: 'videos/video-test.mp4',
            s3Url: 's3://test-bucket/videos/video-test.mp4',
            duration: 60,
            fileSize: 10240000,
          },
          executionId: 'test-execution-123',
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toContain('Failed to get secret');

      // Reset the mock for subsequent tests
      SecretsManager.mockImplementation(() => ({
        getSecretValue: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({
            SecretString: JSON.stringify({
              youtube_client_id: 'test-youtube-client-id',
              youtube_client_secret: 'test-youtube-client-secret',
              youtube_refresh_token: 'test-youtube-refresh-token',
              google_client_id: 'test-google-client-id',
              google_client_secret: 'test-google-client-secret',
              google_refresh_token: 'test-google-refresh-token',
            }),
          }),
        })),
      }));
    });

    it('should work without SNS notification', async () => {
      delete process.env.SNS_TOPIC_ARN;

      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          video: {
            videoUrl: 'https://test-bucket.s3.amazonaws.com/videos/video-test.mp4',
            s3Key: 'videos/video-test.mp4',
            s3Url: 's3://test-bucket/videos/video-test.mp4',
            duration: 60,
            fileSize: 10240000,
          },
          executionId: 'test-execution-123',
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
    });
  });
});
