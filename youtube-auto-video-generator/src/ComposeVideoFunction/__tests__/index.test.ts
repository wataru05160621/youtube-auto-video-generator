import { Context, APIGatewayProxyEvent } from 'aws-lambda';
import { execSync } from 'child_process';
import * as fs from 'fs';

// Mock external modules first
jest.mock('child_process');
jest.mock('fs');
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    getObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Body: Buffer.from('fake-file-content'),
        ContentLength: 1024,
      }),
    }),
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Location: 'https://s3.amazonaws.com/bucket/key',
      }),
    }),
  })),
}));

// Now import everything else
import { handler } from '../index';

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ComposeVideoFunction', () => {
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

    // Mock fs operations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockReturnValue(Buffer.from('fake-video-content'));
    mockFs.statSync.mockReturnValue({
      size: 1024000,
    } as any);
    mockFs.unlinkSync.mockReturnValue(undefined);

    // Mock execSync for FFmpeg
    mockExecSync.mockReturnValue('FFmpeg output');

    // Environment variables
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.FFMPEG_PATH = '/opt/ffmpeg/ffmpeg';
  });

  afterEach(() => {
    delete process.env.S3_BUCKET_NAME;
    delete process.env.FFMPEG_PATH;
  });

  describe('Video Composition', () => {
    it('should successfully compose video from images and audio', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          imageUrls: [
            's3://test-bucket/images/image1.png',
            's3://test-bucket/images/image2.png',
          ],
          audioUrl: 's3://test-bucket/audio/audio.mp3',
          executionId: 'test-execution-123',
          rowData: {
            row: 4,
            title: 'Test Video',
            description: 'Test Description',
          },
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.video).toBeDefined();
      expect(responseBody.video.s3Key).toBe('videos/video-test-execution-123.mp4');
      expect(responseBody.executionId).toBe('test-execution-123');

      // Verify FFmpeg execution
      expect(mockExecSync).toHaveBeenCalled();
    });

    it('should handle missing imageUrls', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          audioUrl: 's3://test-bucket/audio/audio.mp3',
          executionId: 'test-execution-123',
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toContain('imageUrls array is required');
    });

    it('should handle missing audioUrl', async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          imageUrls: ['s3://test-bucket/images/image1.png'],
          executionId: 'test-execution-123',
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toContain('audioUrl is required');
    });

    it('should handle FFmpeg execution errors', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('FFmpeg execution failed');
      });

      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          imageUrls: ['s3://test-bucket/images/image1.png'],
          audioUrl: 's3://test-bucket/audio/audio.mp3',
          executionId: 'test-execution-123',
        }),
      } as any;

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toContain('Failed to compose video');
    });
  });
});
