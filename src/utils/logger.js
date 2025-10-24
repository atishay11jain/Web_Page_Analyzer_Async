const winston = require("winston");
const config = require("../config/app.config");

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  if (Object.keys(metadata).length > 0) {
    const { stack, ...rest } = metadata;
    if (Object.keys(rest).length > 0) {
      msg += ` ${JSON.stringify(rest)}`;
    }
    if (stack) {
      msg += `\n${stack}`;
    }
  }

  return msg;
});

// Create transports array
const transports = [
  new winston.transports.Console({
    format: combine(colorize(), consoleFormat),
  }),
];

// Only add file transports in development or if logs directory is writable
const fs = require("fs");
const path = require("path");
const logsDir = path.join(process.cwd(), "logs");

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  fs.accessSync(logsDir, fs.constants.W_OK);

  transports.push(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: json(),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      format: json(),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
} catch (error) {
  const errorMsg = error?.message || String(error) || "Unknown error";
  console.error(
    `Warning: Unable to write to logs directory, file logging disabled: ${errorMsg}`
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  silent: config.logging.silent,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" })
  ),
  defaultMeta: {
    service: "web-page-analyzer",
    environment: config.env,
  },
  transports,

  // Handle exceptions and rejections to console in production
  exceptionHandlers: [
    new winston.transports.Console({
      format: combine(colorize(), consoleFormat),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: combine(colorize(), consoleFormat),
    }),
  ],

  exitOnError: false,
});

logger.logRequest = (req, res, duration) => {
  logger.info("HTTP Request", {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("user-agent"),
  });
};

logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    error: error.name,
    stack: error.stack,
    ...context,
  });
};

module.exports = logger;
