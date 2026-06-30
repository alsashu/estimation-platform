'use strict';
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

const logsDir = path.resolve(__dirname, '..', config.paths.logs);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const today = new Date().toISOString().slice(0, 10);
const logFile = path.join(logsDir, `automation_${today}.log`);

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const base = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] ${message}`;
    return stack ? `${base}\n${stack}` : base;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    new winston.transports.File({
      filename: logFile,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

function logTestStart(testId, title) {
  logger.info(`${'='.repeat(60)}`);
  logger.info(`TEST START | ${testId} | ${title}`);
  logger.info(`${'='.repeat(60)}`);
}

function logTestEnd(testId, status, durationMs) {
  const icon = status === 'passed' ? '✓' : status === 'failed' ? '✗' : '○';
  const dur = durationMs != null ? ` | ${durationMs}ms` : '';
  logger.info(`TEST END   | ${icon} ${status.toUpperCase()}${dur} | ${testId}`);
  logger.info(`${'─'.repeat(60)}`);
}

function logStep(step) {
  logger.info(`  STEP >> ${step}`);
}

module.exports = { logger, logTestStart, logTestEnd, logStep };
