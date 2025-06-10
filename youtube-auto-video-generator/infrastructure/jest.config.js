module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib', '<rootDir>/bin'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    'bin/**/*.ts',
    '!lib/**/*.d.ts',
    '!lib/**/__tests__/**',
    '!bin/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // CDKのビルド成果物を除外
  testPathIgnorePatterns: [
    '/node_modules/',
    '/cdk.out/',
    '/dist/',
  ],
  // CDKライブラリのインポートをモック
  moduleNameMapper: {
    '^aws-cdk-lib$': '<rootDir>/node_modules/aws-cdk-lib',
    '^constructs$': '<rootDir>/node_modules/constructs',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
