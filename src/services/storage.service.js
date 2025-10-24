const { getRedisClient } = require("../config/redis.config");
const config = require("../config/app.config");
const logger = require("../utils/logger");
const { JOB_STATUS, ERROR_TYPES } = require("../utils/constants");

const TTL = config.storage.ttl; // 48 hours
const KEY_PREFIX = config.storage.keyPrefix;

class StorageError extends Error {
  constructor(message, type = ERROR_TYPES.STORAGE_ERROR, originalError = null) {
    super(message);
    this.name = "StorageError";
    this.type = type;
    this.originalError = originalError;
  }
}

function getJobKey(job_id) {
  return `${KEY_PREFIX}${job_id}`;
}

async function retryOperation(
  operation,
  maxRetries = 3,
  operationName = "operation"
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`${operationName} failed, attempt ${attempt}/${maxRetries}`, {
        error: error.message,
      });

      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new StorageError(
    `${operationName} failed after ${maxRetries} attempts`,
    ERROR_TYPES.STORAGE_ERROR,
    lastError
  );
}

async function createJob(jobData) {
  try {
    if (!jobData.job_id) {
      throw new StorageError(
        "job_id is required",
        ERROR_TYPES.VALIDATION_ERROR
      );
    }
    if (!jobData.url) {
      throw new StorageError("url is required", ERROR_TYPES.VALIDATION_ERROR);
    }
    if (!jobData.status) {
      throw new StorageError(
        "status is required",
        ERROR_TYPES.VALIDATION_ERROR
      );
    }

    const redis = getRedisClient();
    const key = getJobKey(jobData.job_id);

    // Check if job already exists
    const exists = await retryOperation(
      () => redis.exists(key),
      1,
      "check job existence"
    );

    if (exists) {
      logger.warn("Attempted to create duplicate job", {
        job_id: jobData.job_id,
      });
      throw new StorageError(
        "Job already exists",
        ERROR_TYPES.VALIDATION_ERROR
      );
    }

    // Prepare job data with timestamps
    const jobToStore = {
      ...jobData,
    };

    const value = JSON.stringify(jobToStore);

    // Store with TTL using retry logic
    await retryOperation(() => redis.setex(key, TTL, value), 1, "create job");

    return jobToStore;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    logger.error("Failed to create job in Redis", {
      job_id: jobData.job_id,
      error: error.message,
    });
    throw new StorageError(
      "Failed to create job",
      ERROR_TYPES.STORAGE_ERROR,
      error
    );
  }
}

async function getJob(job_id) {
  try {
    if (!job_id) {
      throw new StorageError(
        "job_id is required",
        ERROR_TYPES.VALIDATION_ERROR
      );
    }

    const redis = getRedisClient();
    const key = getJobKey(job_id);

    const value = await retryOperation(() => redis.get(key), 3, "get job");

    if (!value) {
      logger.debug("Job not found", { job_id });
      return null;
    }

    const job = JSON.parse(value);
    return job;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    logger.error("Failed to get job from Redis", {
      job_id,
      error: error.message,
    });
    throw new StorageError(
      "Failed to retrieve job",
      ERROR_TYPES.STORAGE_ERROR,
      error
    );
  }
}

async function updateJob(job_id, updateData) {
  try {
    if (!job_id) {
      throw new StorageError(
        "job_id is required",
        ERROR_TYPES.VALIDATION_ERROR
      );
    }

    const redis = getRedisClient();
    const key = getJobKey(job_id);

    // Get existing job
    const existing = await getJob(job_id);
    if (!existing) {
      throw new StorageError("Job not found", ERROR_TYPES.NOT_FOUND_ERROR);
    }

    // Merge updates with timestamp
    const updated = {
      ...existing,
      ...updateData,
    };

    // Save back with TTL
    await retryOperation(
      () => redis.setex(key, TTL, JSON.stringify(updated)),
      3,
      "update job"
    );

    logger.debug("Job updated in Redis", {
      job_id,
      status: updated.status,
    });

    return updated;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    logger.error("Failed to update job in Redis", {
      job_id,
      error: error.message,
    });
    throw new StorageError(
      "Failed to update job",
      ERROR_TYPES.STORAGE_ERROR,
      error
    );
  }
}

async function updateJobIfPending(job_id, updateData) {
  try {
    if (!job_id) {
      throw new StorageError(
        "job_id is required",
        ERROR_TYPES.VALIDATION_ERROR
      );
    }

    const job = await getJob(job_id);

    if (!job) {
      logger.warn("Job not found for idempotent update", { job_id });
      return false;
    }

    if (job.status !== JOB_STATUS.PENDING) {
      logger.info("Job not in PENDING status, skipping update", {
        job_id,
        current_status: job.status,
      });
      return false;
    }

    await updateJob(job_id, updateData);
    return true;
  } catch (error) {
    logger.error("Failed idempotent update", {
      job_id,
      error: error.message,
    });
    return false;
  }
}

async function ping() {
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    return result === "PONG";
  } catch (error) {
    logger.error("Redis ping failed", {
      error: error.message,
    });
    throw new StorageError(
      "Redis connection failed",
      ERROR_TYPES.STORAGE_ERROR,
      error
    );
  }
}

module.exports = {
  createJob,
  getJob,
  updateJob,
  updateJobIfPending,
  ping,
  StorageError,
};
