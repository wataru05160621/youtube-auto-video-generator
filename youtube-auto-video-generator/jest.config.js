module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // メモリ最適化設定
  maxWorkers: 1, // ワーカーを1つに制限してメモリ使用量を削減
  runInBand: true, // すべてのテストを順次実行
  workerIdleMemoryLimit: '512MB', // アイドル時のメモリ制限
  testTimeout: 30000, // テストタイムアウトを30秒に設定
  logHeapUsage: true, // ヒープ使用量をログに出力
  // ガベージコレクションを強制的に実行
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
