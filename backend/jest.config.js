/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { esModuleInterop: true } }] },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/db/migrate.ts',
    '!src/db/seed.enterprise.ts',
    '!src/db/init.ts',
    '!src/server.ts',
  ],
  coverageThreshold: { global: { lines: 80, functions: 80, branches: 70 } },
  clearMocks: true,
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
};
