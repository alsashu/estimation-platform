'use strict';
module.exports = {
  env: {
    node: true,
    es2020: true,
    mocha: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off',
    'no-undef': 'error',
    'semi': ['error', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'no-trailing-spaces': 'warn',
    'eol-last': ['warn', 'always'],
    'no-multiple-empty-lines': ['warn', { max: 2 }],
    'prefer-const': 'warn',
    'no-var': 'error',
    'arrow-spacing': 'warn',
    'keyword-spacing': 'warn',
    'space-before-blocks': 'warn',
    'no-duplicate-imports': 'error',
  },
  ignorePatterns: [
    'node_modules/',
    'reports/',
    'allure-results/',
    'screenshots/',
    'logs/',
  ],
};
