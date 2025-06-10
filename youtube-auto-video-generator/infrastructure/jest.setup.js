// Jest セットアップファイル for Infrastructure tests

// CDK テスト用のグローバル設定
process.env.AWS_REGION = 'us-east-1';
process.env.CDK_DEFAULT_REGION = 'us-east-1';
process.env.CDK_DEFAULT_ACCOUNT = '123456789012';

// 各テスト後にモックをクリア
afterEach(() => {
  jest.clearAllMocks();
});

// 各テストファイル後にメモリクリーンアップ
afterAll(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});
