import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManager, S3 } from 'aws-sdk';
import OpenAI from 'openai';
import axios from 'axios';

interface GenerateImageInput {
  generatedScript: {
    imagePrompts: string[];
    title: string;
  };
  executionId: string;
  rowData?: any;
}

interface GeneratedImage {
  index: number;
  prompt: string;
  imageUrl: string;
  s3Key: string;
  s3Url: string;
}

interface GenerateImageResult {
  success: boolean;
  images: GeneratedImage[];
  totalImages: number;
  message: string;
}

const secretsManager = new SecretsManager();
const s3 = new S3();

/**
 * OpenAI API キーを取得
 */
async function getOpenAIApiKey(): Promise<string> {
  const secretName = process.env.OPENAI_API_KEY_SECRET_NAME;
  if (!secretName) {
    throw new Error('OPENAI_API_KEY_SECRET_NAME environment variable is required');
  }

  try {
    const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
    if (!result.SecretString) {
      throw new Error('Secret string is empty');
    }
    return result.SecretString;
  } catch (error) {
    console.error('Error getting OpenAI API key:', error);
    throw new Error('Failed to retrieve OpenAI API key from Secrets Manager');
  }
}

/**
 * OpenAI クライアントを初期化
 */
async function initializeOpenAI(): Promise<OpenAI> {
  const apiKey = await getOpenAIApiKey();
  return new OpenAI({ apiKey });
}

/**
 * 画像をダウンロードしてS3に保存
 */
async function downloadAndSaveToS3(
  imageUrl: string,
  executionId: string,
  index: number
): Promise<{ s3Key: string; s3Url: string }> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is required');
  }

  try {
    // 画像をダウンロード
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    // S3キーを生成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const s3Key = `images/${timestamp}-${executionId}-${index}.png`;

    // S3にアップロード
    await s3.putObject({
      Bucket: bucketName,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
      Metadata: {
        executionId,
        imageIndex: index.toString(),
        timestamp: new Date().toISOString(),
        functionName: 'GenerateImageFunction',
      },
    }).promise();

    const s3Url = `s3://${bucketName}/${s3Key}`;
    console.log(`Image ${index} saved to S3: ${s3Url}`);

    return { s3Key, s3Url };
  } catch (error) {
    console.error(`Error downloading/saving image ${index}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download and save image ${index}: ${errorMessage}`);
  }
}

/**
 * DALL-E で画像を生成
 */
async function generateImage(prompt: string, index: number): Promise<string> {
  const openai = await initializeOpenAI();

  try {
    console.log(`Generating image ${index + 1} with prompt: ${prompt}`);

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned from DALL-E');
    }

    console.log(`Image ${index + 1} generated successfully`);
    return imageUrl;
  } catch (error) {
    console.error(`Error generating image ${index + 1}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate image ${index + 1}: ${errorMessage}`);
  }
}

/**
 * 複数の画像を生成
 */
async function generateImages(
  imagePrompts: string[],
  executionId: string
): Promise<GeneratedImage[]> {
  const results: GeneratedImage[] = [];

  // 並列処理を避けて順次実行（DALL-E APIのレート制限対策）
  for (let i = 0; i < imagePrompts.length; i++) {
    try {
      const prompt = imagePrompts[i];

      // 画像生成
      const imageUrl = await generateImage(prompt, i);

      // S3に保存
      const { s3Key, s3Url } = await downloadAndSaveToS3(imageUrl, executionId, i);

      results.push({
        index: i,
        prompt,
        imageUrl,
        s3Key,
        s3Url,
      });

      // レート制限対策として少し待機
      if (i < imagePrompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Failed to process image ${i}:`, error);
      // 一つの画像が失敗しても続行
      results.push({
        index: i,
        prompt: imagePrompts[i],
        imageUrl: '',
        s3Key: '',
        s3Url: '',
      });
    }
  }

  return results;
}

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('GenerateImageFunction started', {
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
          images: [],
          totalImages: 0,
          message: 'Request body is required',
        }),
      };
    }

    // 入力データの解析
    let input: GenerateImageInput;

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
          images: [],
          totalImages: 0,
          message: 'Invalid JSON in request body',
        }),
      };
    }

    // 必須フィールドの検証
    if (!input.generatedScript?.imagePrompts || !Array.isArray(input.generatedScript.imagePrompts)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          images: [],
          totalImages: 0,
          message: 'generatedScript.imagePrompts array is required',
        }),
      };
    }

    if (input.generatedScript.imagePrompts.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          images: [],
          totalImages: 0,
          message: 'At least one image prompt is required',
        }),
      };
    }

    console.log(`Generating ${input.generatedScript.imagePrompts.length} images`);

    // 画像生成
    const images = await generateImages(
      input.generatedScript.imagePrompts,
      input.executionId
    );

    // 成功した画像の数をカウント
    const successfulImages = images.filter(img => img.imageUrl && img.s3Url);

    const result: GenerateImageResult = {
      success: successfulImages.length > 0,
      images,
      totalImages: images.length,
      message: `Generated ${successfulImages.length}/${images.length} images successfully`,
    };

    console.log('GenerateImageFunction completed', {
      total: images.length,
      successful: successfulImages.length,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('GenerateImageFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: GenerateImageResult = {
      success: false,
      images: [],
      totalImages: 0,
      message: `Failed to generate images: ${errorMessage}`,
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
