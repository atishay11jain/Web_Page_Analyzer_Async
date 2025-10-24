// Job Status Constants
const JOB_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Error Types
const ERROR_TYPES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
  STORAGE_ERROR: "STORAGE_ERROR",
  QUEUE_ERROR: "QUEUE_ERROR",
  NOT_FOUND_ERROR: "NOT_FOUND_ERROR",
};

// Error Messages
const ERROR_MESSAGES = {
  INVALID_URL_FORMAT: "Invalid URL format",
  URL_SSRF_DETECTED: "URLs pointing to private networks are not allowed",
  JOB_NOT_FOUND: "Job not found",
  QUEUE_UNAVAILABLE: "Queue system is down, please try again later",
  STORAGE_UNAVAILABLE: "Storage system is unavailable",
  INTERNAL_ERROR: "An internal error occurred",
  INVALID_JOB_ID: "Invalid job ID format",
};

// Validation Constants
const VALIDATION = {
  MAX_URL_LENGTH: 2048,
  MIN_URL_LENGTH: 10,
  MAX_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB
  ULID_LENGTH: 26,
};

// Timing Constants (milliseconds)
const TIMING = {
  JOB_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  PROCESSING_WARNING_THRESHOLD: 5 * 60 * 1000, // 5 minutes
  REQUEST_TIMEOUT: 30 * 1000, // 30 seconds
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
};

// Redis Key Prefixes
const REDIS_KEYS = {
  JOB_PREFIX: "job:",
  QUEUE_PREFIX: "bull:web-analysis:",
  HEALTH_KEY: "health:check",
};

module.exports = {
  JOB_STATUS,
  HTTP_STATUS,
  ERROR_TYPES,
  ERROR_MESSAGES,
  VALIDATION,
  TIMING,
  REDIS_KEYS,
};
