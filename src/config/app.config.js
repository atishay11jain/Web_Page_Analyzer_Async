module.exports = {
  // Server configuration
  port: parseInt(process.env.PORT || "3000", 10),
  env: process.env.NODE_ENV || "development",

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || "0", 10),
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    enableReadyCheck: true,
    enableOfflineQueue: true,
  },

  // Storage configuration
  storage: {
    ttl: 172800, // 48 hours in seconds
    keyPrefix: "job:",
  },

  // Worker configuration
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "2", 10),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || "10", 10),
  },

  // Queue configuration
  queue: {
    name: "web-analysis",
    maxRetries: 3,
    backoffDelay: 1000, // milliseconds
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000, // 1s, 2s, 4s
      },
      removeOnComplete: {
        age: 86400, // Keep completed jobs for 24 hours
      },
      removeOnFail: {
        age: 604800, // Keep failed jobs for 7 days
      },
      timeout: 300000, // 5 minutes max per job
    },
  },

  // HTTP fetcher configuration
  fetcher: {
    timeout: 60000, // 60 seconds total
    responseTimeout: 30000, // 30 seconds for response
    maxRedirects: 5,
    maxContentLength: 10 * 1024 * 1024, // 10MB max
    userAgent: "WebPageAnalyzer/1.0 (Educational Project)",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
  },

  // Cleanup service configuration
  cleanup: {
    enabled: process.env.CLEANUP_ENABLED !== "false",
    intervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || "5", 10),
    jobAgeThresholdMinutes: parseInt(
      process.env.CLEANUP_JOB_AGE_MINUTES || "10",
      10
    ),
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
    silent: process.env.NODE_ENV === "test",
  },

  // API configuration
  api: {
    requestTimeout: 30000, // 30 seconds
    bodyLimit: "1mb",
    corsEnabled: process.env.CORS_ENABLED === "true",
    rateLimitWindowMs: 60000, // 1 minute
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  },
};
