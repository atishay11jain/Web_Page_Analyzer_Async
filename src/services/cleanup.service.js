const storageService = require("./storage.service");
const queueService = require("./queue.service");
const logger = require("../utils/logger");
const config = require("../config/app.config");
const { JOB_STATUS } = require("../utils/constants");

class CleanupService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.stats = {
      totalRunsCompleted: 0,
      totalJobsCleaned: 0,
      lastRunAt: null,
      lastRunDuration: 0,
    };
  }

  start(intervalMinutes = config.cleanup.intervalMinutes) {
    if (this.isRunning) {
      logger.warn("Cleanup service already running");
      return;
    }

    if (!config.cleanup.enabled) {
      logger.info("Cleanup service is disabled in configuration");
      return;
    }

    logger.info("Starting cleanup service", {
      intervalMinutes,
      jobAgeThreshold: config.cleanup.jobAgeThresholdMinutes,
    });

    this.isRunning = true;

    // Run immediately on start
    this.runCleanup();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, intervalMinutes * 60 * 1000);

    logger.info("Cleanup service started successfully");
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (!this.isRunning) {
      logger.warn("Cleanup service is not running");
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;

      logger.info("Cleanup service stopped", {
        stats: this.stats,
      });
    }
  }

  /**
   * Run cleanup process
   */
  async runCleanup() {
    const startTime = Date.now();

    try {
      logger.info("Running cleanup job");

      let cleanedCount = 0;

      // 1. Find old PENDING jobs
      const oldJobs = await storageService.findOldPendingJobs(
        config.cleanup.jobAgeThresholdMinutes
      );

      logger.info(`Found ${oldJobs.length} old PENDING jobs`);

      // 2. Process each old job
      for (const job of oldJobs) {
        try {
          const cleaned = await this.cleanupJob(job);
          if (cleaned) {
            cleanedCount++;
          }
        } catch (error) {
          logger.error("Error cleaning up individual job", {
            job_id: job.job_id,
            error: error.message,
          });
        }
      }

      // 3. Clean old completed/failed jobs from queue
      try {
        const queueCleanedCompleted = await queueService.cleanOldJobs(
          24 * 60 * 60 * 1000, // 24 hours
          "completed"
        );

        const queueCleanedFailed = await queueService.cleanOldJobs(
          7 * 24 * 60 * 60 * 1000, // 7 days
          "failed"
        );

        logger.info("Cleaned old jobs from queue", {
          completed: queueCleanedCompleted,
          failed: queueCleanedFailed,
        });
      } catch (queueError) {
        logger.error("Error cleaning queue", {
          error: queueError.message,
        });
      }

      // 4. Update stats
      const duration = Date.now() - startTime;
      this.stats.totalRunsCompleted++;
      this.stats.totalJobsCleaned += cleanedCount;
      this.stats.lastRunAt = new Date().toISOString();
      this.stats.lastRunDuration = duration;

      logger.info("Cleanup job completed", {
        jobsCleaned: cleanedCount,
        duration: `${duration}ms`,
        totalRuns: this.stats.totalRunsCompleted,
      });
    } catch (error) {
      logger.error("Cleanup job failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Cleanup a single job
   * @param {object} job - Job object
   * @returns {Promise<boolean>} True if cleaned
   */
  async cleanupJob(job) {
    try {
      // Check if job exists in Bull queue
      const queueInfo = await queueService.getJobInfo(job.job_id);

      if (!queueInfo.found || queueInfo.position === -1) {
        // Job not in queue - it's lost/orphaned
        logger.warn("Lost/orphaned job detected", {
          job_id: job.job_id,
          url: job.url,
          created_at: job.created_at,
          age_minutes: Math.round(
            (Date.now() - new Date(job.created_at)) / 60000
          ),
        });

        // Mark as failed in storage
        await storageService.updateJob(job.job_id, {
          status: JOB_STATUS.FAILED,
          error: "Job lost in queue after timeout. Please retry.",
          error_type: "TIMEOUT_ERROR",
          failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        logger.info("Marked lost job as FAILED", {
          job_id: job.job_id,
        });

        return true;
      }

      // Job is in queue but taking too long
      if (queueInfo.state === "waiting" || queueInfo.state === "active") {
        const age = Date.now() - new Date(job.created_at).getTime();
        const maxAge = 30 * 60 * 1000; // 30 minutes

        if (age > maxAge) {
          logger.warn("Job stuck in queue for too long", {
            job_id: job.job_id,
            state: queueInfo.state,
            age_minutes: Math.round(age / 60000),
          });

          // Remove from queue
          await queueService.removeJob(job.job_id);

          // Mark as failed
          await storageService.updateJob(job.job_id, {
            status: JOB_STATUS.FAILED,
            error: "Job exceeded maximum processing time (30 minutes)",
            error_type: "TIMEOUT_ERROR",
            failed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          logger.info("Removed stuck job from queue", {
            job_id: job.job_id,
          });

          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error("Error in cleanupJob", {
        job_id: job.job_id,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get cleanup statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      intervalMinutes: config.cleanup.intervalMinutes,
    };
  }

  /**
   * Force run cleanup immediately
   */
  async forceRun() {
    logger.info("Force running cleanup job");
    await this.runCleanup();
  }
}

// Export singleton instance
module.exports = new CleanupService();
