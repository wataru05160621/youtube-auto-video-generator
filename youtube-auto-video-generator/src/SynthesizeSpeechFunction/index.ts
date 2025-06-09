import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Polly, S3 } from 'aws-sdk';

interface SynthesizeSpeechInput {
  generatedScript: {
    script: string;
    title: string;
    estimatedDuration?: number;
  };
  executionId: string;
  voiceId?: string;
  language?: string;
}

interface SynthesizeSpeechResult {
  success: boolean;
  audioFileS3Key: string;
  audioFileS3Url: string;
  audioDuration: number;
  voiceId: string;
  message: string;
}

const polly = new Polly();
const s3 = new S3();

/**
 * テキストの長さから推定再生時間を計算（秒）
 */
function estimateAudioDuration(text: string): number {
  // 日本語の場合、平均的に1文字あたり約0.15秒
  // 英語の場合、平均的に1単語あたり約0.6秒
  const japaneseCharCount = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
  const englishWords = text.split(/\s+/).filter(word => word.length > 0);
  const englishWordCount = englishWords.length;

  const japaneseDuration = japaneseCharCount * 0.15;
  const englishDuration = englishWordCount * 0.6;

  const estimatedDuration = japaneseDuration + englishDuration;
  
  // 最小10秒、実際の長さに基づいた推定値を返す
  return Math.max(10, Math.round(estimatedDuration));
}

/**
 * 適切な日本語音声を選択
 */
function selectVoice(voiceId?: string): string {
  const availableVoices = [
    'Mizuki',    // 女性、標準的な日本語
    'Takumi',    // 男性、標準的な日本語
    'Kazuha',    // 女性、ニューラル音声
    'Tomoko',    // 女性、明るい声
  ];

  if (voiceId && availableVoices.includes(voiceId)) {
    return voiceId;
  }

  // デフォルトは Mizuki を使用
  return 'Mizuki';
}

/**
 * テキストを音声に変換
 */
async function synthesizeSpeech(
  text: string,
  voiceId: string,
  language: string = 'ja-JP'
): Promise<Buffer> {
  try {
    console.log(`Synthesizing speech with voice: ${voiceId}, language: ${language}`);

    const params = {
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: voiceId,
      LanguageCode: language,
      Engine: 'neural', // より自然な音声のため
      SampleRate: '22050', // 高品質音声
    };

    const result = await polly.synthesizeSpeech(params).promise();

    if (!result.AudioStream) {
      throw new Error('No audio stream returned from Polly');
    }

    return result.AudioStream as Buffer;
  } catch (error) {
    console.error('Error synthesizing speech:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to synthesize speech: ${errorMessage}`);
  }
}

/**
 * 音声ファイルをS3に保存
 */
async function saveAudioToS3(
  audioBuffer: Buffer,
  executionId: string
): Promise<{ s3Key: string; s3Url: string }> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is required');
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const s3Key = `audio/${timestamp}-${executionId}.mp3`;

    await s3.putObject({
      Bucket: bucketName,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
      Metadata: {
        executionId,
        timestamp: new Date().toISOString(),
        functionName: 'SynthesizeSpeechFunction',
      },
    }).promise();

    const s3Url = `s3://${bucketName}/${s3Key}`;
    console.log(`Audio saved to S3: ${s3Url}`);

    return { s3Key, s3Url };
  } catch (error) {
    console.error('Error saving audio to S3:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to save audio to S3: ${errorMessage}`);
  }
}

/**
 * テキストを分割して長すぎる場合に対応
 */
function splitTextForPolly(text: string, maxLength: number = 3000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(/[。！？\n]/);
  let currentChunk = '';

  for (const sentence of sentences) {
    const potentialChunk = currentChunk + sentence + '。';

    if (potentialChunk.length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence + '。';
    } else {
      currentChunk = potentialChunk;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * 複数のテキストチャンクを音声に変換して結合
 */
async function synthesizeAndCombineAudio(
  text: string,
  voiceId: string,
  language: string,
  executionId: string
): Promise<{ audioBuffer: Buffer; duration: number }> {
  const textChunks = splitTextForPolly(text);
  console.log(`Split text into ${textChunks.length} chunks`);

  if (textChunks.length === 1) {
    // 単一チャンクの場合は直接処理
    const audioBuffer = await synthesizeSpeech(textChunks[0], voiceId, language);
    const duration = estimateAudioDuration(text);
    return { audioBuffer, duration };
  }

  // 複数チャンクの場合は順次処理して結合
  const audioBuffers: Buffer[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${textChunks.length}`);
    const chunkAudio = await synthesizeSpeech(textChunks[i], voiceId, language);
    audioBuffers.push(chunkAudio);

    // レート制限対策
    if (i < textChunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // バッファを結合（簡易的な結合、実際のプロダクションではFFmpegを使用推奨）
  const combinedBuffer = Buffer.concat(audioBuffers);
  const duration = estimateAudioDuration(text);

  return { audioBuffer: combinedBuffer, duration };
}

/**
 * Lambda ハンドラー関数
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('SynthesizeSpeechFunction started', {
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
          audioFileS3Key: '',
          audioFileS3Url: '',
          audioDuration: 0,
          voiceId: '',
          message: 'Request body is required',
        }),
      };
    }

    // 入力データの解析
    let input: SynthesizeSpeechInput;

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
          audioFileS3Key: '',
          audioFileS3Url: '',
          audioDuration: 0,
          voiceId: '',
          message: 'Invalid JSON in request body',
        }),
      };
    }

    // 必須フィールドの検証
    if (!input.generatedScript?.script || input.generatedScript.script.trim().length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          audioFileS3Key: '',
          audioFileS3Url: '',
          audioDuration: 0,
          voiceId: '',
          message: 'Script text is required',
        }),
      };
    }

    const script = input.generatedScript.script.trim();

    console.log(`Synthesizing speech for script (${script.length} characters)`);

    // 音声設定
    const voiceId = selectVoice(input.voiceId);
    const language = input.language || 'ja-JP';

    // 音声合成
    const { audioBuffer, duration } = await synthesizeAndCombineAudio(
      script,
      voiceId,
      language,
      input.executionId
    );

    // S3に保存
    const { s3Key, s3Url } = await saveAudioToS3(audioBuffer, input.executionId);

    const result: SynthesizeSpeechResult = {
      success: true,
      audioFileS3Key: s3Key,
      audioFileS3Url: s3Url,
      audioDuration: duration,
      voiceId,
      message: 'Speech synthesized successfully',
    };

    console.log('SynthesizeSpeechFunction completed successfully', {
      audioFileS3Key: s3Key,
      audioDuration: duration,
      voiceId,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('SynthesizeSpeechFunction failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: SynthesizeSpeechResult = {
      success: false,
      audioFileS3Key: '',
      audioFileS3Url: '',
      audioDuration: 0,
      voiceId: '',
      message: `Failed to synthesize speech: ${errorMessage}`,
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
