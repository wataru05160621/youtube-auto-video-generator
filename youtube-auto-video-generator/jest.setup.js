// Jest セットアップファイル - メモリ最適化

// 各テスト後にガベージコレクションを強制実行
afterEach(() => {
  if (global.gc) {
    global.gc();
  }
});

// 各テストファイル後にメモリクリーンアップ
afterAll(() => {
  if (global.gc) {
    global.gc();
  }
  // モックをクリア
  jest.clearAllMocks();
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

// ログファイルのクリーンアップ
process.on('exit', () => {
  if (global.gc) {
    global.gc();
  }
});
