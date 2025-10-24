const {
  createRedisClient,
  closeRedisClient,
} = require("../config/redis.config");
const { getQueue, closeQueue } = require("../services/queue.service");
const { processJob } = require("./processor");
const config = require("../config/app.config");
const logger = require("../utils/logger");

async function initializeWorker() {
  try {
    const redis = createRedisClient();
    await redis.connect();
    logger.info("Redis connected successfully");

    const queue = getQueue();
    logger.info("Queue initialized successfully");

    // Set up job processor
    queue.process(config.worker.concurrency, async (job) => {
      const { job_id, url } = job.data;

      logger.info("Processing job from queue", {
        bullJobId: job.id,
        job_id,
        url,
      });

      try {
        // Process the job
        const result = await processJob(job_id, url);

        // Update job progress
        await job.progress(100);

        logger.info("Job processing completed", {
          bullJobId: job.id,
          job_id,
          success: result.success,
        });

        return result;
      } catch (error) {
        logger.error("Job processing threw error", {
          bullJobId: job.id,
          job_id,
          url,
          error: error.message,
          attempt: job.attemptsMade + 1,
          stack: error.stack,
        });

        // Let Bull handle retries
        throw error;
      }
    });

    logger.info("Worker started successfully", {
      concurrency: config.worker.concurrency,
      queueName: config.queue.name,
    });

    // Set up event handlers
    setupEventHandlers(queue);

    return queue;
  } catch (error) {
    logger.error("Failed to initialize worker", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Set up queue event handlers
 * @param {Queue} queue - Bull queue instance
 */
function setupEventHandlers(queue) {
  // Job completed
  queue.on("completed", (job, result) => {
    logger.info("Job completed successfully", {
      bullJobId: job.id,
      job_id: job.data.job_id,
      processingTime: Date.now() - job.timestamp,
      success: result.success,
    });
  });

  // Job failed
  queue.on("failed", async (job, error) => {
    const isFinalAttempt = job.attemptsMade >= job.opts.attempts;

    logger.error("Job failed", {
      bullJobId: job.id,
      job_id: job.data.job_id,
      url: job.data.url,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      isFinalAttempt,
      error: error.message,
    });

    if (isFinalAttempt) {
      logger.error("Job permanently failed after all retries", {
        bullJobId: job.id,
        job_id: job.data.job_id,
        url: job.data.url,
      });
    }
  });

  // Job stalled
  queue.on("stalled", (job) => {
    logger.warn("Job stalled (worker crashed or timed out)", {
      bullJobId: job.id,
      job_id: job.data.job_id,
      url: job.data.url,
      attemptsMade: job.attemptsMade,
    });
  });

  // Job progress
  queue.on("progress", (job, progress) => {
    logger.debug("Job progress update", {
      bullJobId: job.id,
      job_id: job.data.job_id,
      progress: `${progress}%`,
    });
  });

  // Queue error
  queue.on("error", (error) => {
    logger.error("Queue error", {
      error: error.message,
      stack: error.stack,
    });
  });

  // Worker ready
  queue.on("ready", () => {
    logger.info("Queue is ready and accepting jobs");
  });

  // Queue paused
  queue.on("paused", () => {
    logger.warn("Queue has been paused");
  });

  // Queue resumed
  queue.on("resumed", () => {
    logger.info("Queue has been resumed");
  });
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown...`);

  try {
    // Stop accepting new jobs
    const queue = getQueue();
    await queue.pause(true, true); // Local pause, don't wait for active jobs
    logger.info("Queue paused, no new jobs will be accepted");

    // Wait for active jobs to complete (with timeout)
    const waitForJobs = async () => {
      const activeCount = await queue.getActiveCount();
      if (activeCount > 0) {
        logger.info(`Waiting for ${activeCount} active jobs to complete...`);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        return waitForJobs(); // Recursive check
      }
    };

    await Promise.race([
      waitForJobs(),
      new Promise((resolve) => setTimeout(resolve, 25000)), // 25 second timeout
    ]);

    // Close queue
    await closeQueue();
    logger.info("Queue closed successfully");

    // Close Redis
    await closeRedisClient();
    logger.info("Redis connection closed");

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

/**
 * Start worker
 */
async function start() {
  try {
    await initializeWorker();

    logger.info("Worker process started", {
      pid: process.pid,
      nodeVersion: process.version,
      env: config.env,
    });

    // Handle shutdown signals
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception in worker", {
        error: error.message,
        stack: error.stack,
      });
      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled rejection in worker", {
        reason,
        promise,
      });
      shutdown("UNHANDLED_REJECTION");
    });
  } catch (error) {
    logger.error("Failed to start worker", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start worker if running directly
if (require.main === module) {
  start();
}

module.exports = { start, initializeWorker };
