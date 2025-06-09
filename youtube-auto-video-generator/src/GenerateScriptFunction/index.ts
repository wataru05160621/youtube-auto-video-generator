import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManager } from 'aws-sdk';
import OpenAI from 'openai';

interface ScriptGenerationInput {
  prompt: string;
  videoTheme: string;
  duration: number;
  rowData: any;
  spreadsheetId: string;
  executionId: string;
}

interface GeneratedScript {
  title: string;
  description: string;
  script: string;
  imagePrompts: string[];
  tags: string[];
  estimatedDuration: number;
}

interface ScriptGenerationResult extends ScriptGenerationInput {
  generatedScript: GeneratedScript;
  success?: boolean;
  timestamp: string;
  error?: string;
}

const secretsManager = new SecretsManager();

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
 * 動画台本を生成
 */
async function generateScript(
  prompt: string,
  videoTheme: string,
  duration: number
): Promise<GeneratedScript> {
  const openai = await initializeOpenAI();

  const systemPrompt = `
あなたは優れた動画脚本作家です。以下の条件に従って、YouTube動画用の台本を作成してください。

## 出力形式
以下のJSON形式で回答してください：
{
  "title": "動画のタイトル（最大100文字）",
  "description": "動画の説明文（最大500文字）",
  "script": "動画の台本（ナレーション用）",
  "imagePrompts": ["画像生成用のプロンプト1", "画像生成用のプロンプト2", ...],
  "tags": ["タグ1", "タグ2", ...],
  "estimatedDuration": 推定再生時間（秒）
}

## 制約条件
- 動画の長さ: 約${duration}秒
- テーマ: ${videoTheme}
- 台本は自然な日本語で、聞き取りやすい内容にしてください
- 画像プロンプトは英語で、DALL-E用に最適化してください
- 各画像プロンプトは台本の流れに合わせて順番に配置してください
- 台本は段落ごとに区切り、各段落に対応する画像プロンプトを作成してください
- タグは動画の内容に関連するものを10個以内で選んでください
`;

  const userPrompt = `
以下の内容で動画台本を作成してください：

プロンプト: ${prompt}
テーマ: ${videoTheme}
希望時間: ${duration}秒

台本は魅力的で分かりやすく、視聴者が最後まで見たくなるような構成にしてください。
`;

  try {
    console.log('Generating script with OpenAI...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content generated from OpenAI');
    }

    // JSONパースを試行
    let generatedScript: GeneratedScript;
    try {
      generatedScript = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', content);
      throw new Error('OpenAI response is not valid JSON format');
    }

    // 必須フィールドの検証
    if (!generatedScript.title || !generatedScript.script || !generatedScript.imagePrompts) {
      throw new Error('Generated script is missing required fields');
    }

    console.log('Script generated successfully');
    return generatedScript;
  } catch (error) {
    console.error('Error generating script with OpenAI:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate script: ${errorMessage}`);
  }
}

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('GenerateScriptFunction started', {
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
          error: 'Request body is required',
          executionId: context.awsRequestId,
        }),
      };
    }

    // 入力データの解析
    let input: ScriptGenerationInput;

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
          error: 'Invalid JSON in request body',
          executionId: context.awsRequestId,
        }),
      };
    }

    // 必須フィールドの検証
    if (!input.prompt || !input.videoTheme) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          error: 'prompt and videoTheme are required',
          executionId: context.awsRequestId,
        }),
      };
    }

    console.log('Generating script for:', {
      prompt: input.prompt,
      videoTheme: input.videoTheme,
      duration: input.duration,
    });

    // 台本生成
    const generatedScript = await generateScript(
      input.prompt,
      input.videoTheme,
      input.duration || 60
    );

    const result: ScriptGenerationResult = {
      ...input,
      generatedScript,
      success: true,
      timestamp: new Date().toISOString(),
    };

    console.log('GenerateScriptFunction completed successfully');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('GenerateScriptFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        executionId: context.awsRequestId,
      }),
    };
  }
}
