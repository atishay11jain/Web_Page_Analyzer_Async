const Queue = require("bull");
const config = require("../config/app.config");
const logger = require("../utils/logger");
const { ERROR_TYPES } = require("../utils/constants");

let analysisQueue = null;

class QueueError extends Error {
  constructor(message, type = ERROR_TYPES.QUEUE_ERROR, originalError = null) {
    super(message);
    this.name = "QueueError";
    this.type = type;
    this.originalError = originalError;
  }
}

function initializeQueue() {
  if (analysisQueue) {
    return analysisQueue;
  }

  try {
    const { maxRetriesPerRequest, enableReadyCheck, ...bullRedisConfig } =
      config.redis;

    analysisQueue = new Queue(config.queue.name, {
      redis: {
        ...bullRedisConfig,
        maxRetriesPerRequest: null, // Required for Bull
        enableReadyCheck: false, // Required for Bull
      },
      defaultJobOptions: config.queue.defaultJobOptions,
      settings: {
        stalledInterval: 30000, // 30 seconds
        maxStalledCount: 2,
        guardInterval: 5000,
        retryProcessDelay: 5000,
      },
    });

    setupQueueListeners(analysisQueue);

    logger.info("Bull queue initialized", {
      queueName: config.queue.name,
      concurrency: config.worker.concurrency,
    });

    return analysisQueue;
  } catch (error) {
    logger.error("Failed to initialize queue", { error: error.message });
    throw new QueueError(
      "Queue initialization failed",
      ERROR_TYPES.QUEUE_ERROR,
      error
    );
  }
}

function setupQueueListeners(queue) {
  queue.on("error", (error) => {
    logger.error("Queue error", {
      error: error.message,
    });
  });

  queue.on("waiting", (jobId) => {
    logger.debug("Job waiting", { jobId });
  });

  queue.on("active", (job) => {
    logger.info("Job active", {
      jobId: job.id,
      data: job.data,
    });
  });

  queue.on("stalled", (job) => {
    logger.warn("Job stalled", {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      data: job.data,
    });
  });

  queue.on("progress", (job, progress) => {
    logger.debug("Job progress", {
      jobId: job.id,
      progress,
    });
  });

  queue.on("completed", (job, result) => {
    logger.info("Job completed", {
      jobId: job.id,
      processingTime: Date.now() - job.timestamp,
    });
  });

  queue.on("failed", (job, error) => {
    logger.error("Job failed", {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      error: error.message,
      data: job.data,
    });
  });

  queue.on("paused", () => {
    logger.warn("Queue paused");
  });

  queue.on("resumed", () => {
    logger.info("Queue resumed");
  });

  queue.on("cleaned", (jobs, type) => {
    logger.info("Queue cleaned", {
      jobCount: jobs.length,
      type,
    });
  });

  queue.on("drained", () => {
    logger.info("Queue drained - all jobs processed");
  });

  queue.on("removed", (job) => {
    logger.debug("Job removed", { jobId: job.id });
  });
}

function getQueue() {
  if (!analysisQueue) {
    return initializeQueue();
  }
  return analysisQueue;
}

async function enqueue(data, options = {}) {
  try {
    if (!data.job_id || !data.url) {
      throw new QueueError(
        "Invalid job data: job_id and url are required",
        ERROR_TYPES.VALIDATION_ERROR
      );
    }

    const queue = getQueue();

    const jobOptions = {
      ...config.queue.defaultJobOptions,
      ...options,
      jobId: data.job_id, // Use job_id as Bull job ID for easy lookup
    };

    const job = await queue.add(data, jobOptions);

    logger.info("Job enqueued", {
      job_id: data.job_id,
      bullJobId: job.id,
      url: data.url,
    });

    return job;
  } catch (error) {
    logger.error("Failed to enqueue job", {
      job_id: data.job_id,
      error: error.message,
    });

    if (error instanceof QueueError) {
      throw error;
    }

    throw new QueueError(
      "Failed to enqueue job",
      ERROR_TYPES.QUEUE_ERROR,
      error
    );
  }
}

async function getJobInfo(job_id) {
  try {
    const queue = getQueue();
    const bullJob = await queue.getJob(job_id);

    if (!bullJob) {
      return {
        found: false,
        position: -1,
        estimatedWait: 0,
      };
    }

    const state = await bullJob.getState();

    if (state === "waiting") {
      const waiting = await queue.getWaiting();
      const position = waiting.findIndex((j) => j.id === job_id) + 1;

      const activeCount = await queue.getActiveCount();
      const avgProcessingTime = 8; // seconds (estimate)
      const estimatedWait =
        position > 0
          ? Math.round(
              (position * avgProcessingTime) / Math.max(activeCount, 1)
            )
          : 0;

      return {
        found: true,
        state,
        position,
        estimatedWait,
      };
    }

    // If job is active
    if (state === "active") {
      return {
        found: true,
        state,
        position: 0, // Currently processing
        estimatedWait: 0,
      };
    }

    // Job is completed, failed, or delayed
    return {
      found: true,
      state,
      position: -1,
      estimatedWait: 0,
    };
  } catch (error) {
    logger.error("Failed to get job info", {
      job_id,
      error: error.message,
    });

    return {
      found: false,
      position: -1,
      estimatedWait: 0,
      error: error.message,
    };
  }
}

/**
 * Remove a job from the queue
 * @param {string} job_id - Job ID
 * @returns {Promise<boolean>} True if removed
 */
async function removeJob(job_id) {
  try {
    const queue = getQueue();
    const job = await queue.getJob(job_id);

    if (!job) {
      return false;
    }

    await job.remove();
    logger.info("Job removed from queue", { job_id });
    return true;
  } catch (error) {
    logger.error("Failed to remove job from queue", {
      job_id,
      error: error.message,
    });
    return false;
  }
}

async function cleanOldJobs(grace = 86400000, status = "completed") {
  try {
    const queue = getQueue();
    const jobs = await queue.clean(grace, status);
    logger.info("Cleaned old jobs", {
      count: jobs.length,
      status,
      grace: `${grace}ms`,
    });
    return jobs.length;
  } catch (error) {
    logger.error("Failed to clean old jobs", { error: error.message });
    return 0;
  }
}

async function checkQueueHealth() {
  try {
    const queue = getQueue();
    const stats = await getQueueStats();

    // Check if queue is responsive
    const isPaused = await queue.isPaused();

    return {
      healthy: true,
      isPaused,
      stats,
    };
  } catch (error) {
    logger.error("Queue health check failed", { error: error.message });
    return {
      healthy: false,
      error: error.message,
    };
  }
}

async function closeQueue() {
  if (analysisQueue) {
    try {
      await analysisQueue.close();
      analysisQueue = null;
      logger.info("Queue closed gracefully");
    } catch (error) {
      logger.error("Error closing queue", { error: error.message });
    }
  }
}

module.exports = {
  initializeQueue,
  getQueue,
  enqueue,
  getJobInfo,
  removeJob,
  cleanOldJobs,
  checkQueueHealth,
  closeQueue,
  QueueError,
};
