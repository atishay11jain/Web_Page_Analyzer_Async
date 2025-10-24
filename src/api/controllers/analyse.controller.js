const { generateNumericJobId } = require("../../utils/jobIdGenerator");
const { validateUrlComplete } = require("../../utils/urlValidator");
const queueService = require("../../services/queue.service");
const storageService = require("../../services/storage.service");
const logger = require("../../utils/logger");
const {
  HTTP_STATUS,
  JOB_STATUS,
  ERROR_MESSAGES,
} = require("../../utils/constants");

async function analyseUrl(req, res, next) {
  const { url } = req.body;

  try {
    const validation = validateUrlComplete(url);
    if (!validation.valid) {
      logger.warn("Invalid URL submitted", {
        url,
        error: validation.error,
      });

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: validation.error,
        message: validation.details,
      });
    }

    const job_id = generateNumericJobId();
    const timestamp = new Date().toISOString();

    try {
      await storageService.createJob({
        job_id,
        url,
        status: JOB_STATUS.PENDING,
      });
    } catch (storageError) {
      logger.error("Failed to create job in storage", {
        job_id,
        url,
        error: storageError.message,
        requestId: req.id,
      });

      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: ERROR_MESSAGES.STORAGE_UNAVAILABLE,
        message: "Failed to create job. Please try again.",
      });
    }

    try {
      await queueService.enqueue(
        { job_id, url },
        {
          timeout: 5000,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000, // 1s, 2s, 4s
          },
          removeOnComplete: false,
          removeOnFail: false,
        }
      );

      logger.info("Job queued successfully", {
        job_id,
        url,
        requestId: req.id,
      });
    } catch (queueError) {
      logger.error("Failed to enqueue job", {
        job_id,
        url,
        error: queueError.message,
        requestId: req.id,
      });

      // Update status in Redis to FAILED
      try {
        await storageService.updateJob(job_id, {
          status: JOB_STATUS.FAILED,
          error: "Failed to queue job",
        });
      } catch (updateError) {
        logger.error("Failed to update job status after queue error", {
          job_id,
          error: updateError.message,
        });
      }

      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: ERROR_MESSAGES.QUEUE_UNAVAILABLE,
        message:
          "Queue system is temporarily unavailable. Please try again later.",
      });
    }

    return res.status(HTTP_STATUS.ACCEPTED).json({
      job_id,
      status: JOB_STATUS.PENDING,
      message: "Job queued successfully",
    });
  } catch (error) {
    logger.error("Unexpected error in analyseUrl", {
      error: error.message,
      stack: error.stack,
      url,
      requestId: req.id,
    });
    next(error);
  }
}

function validateRequest(req, res, next) {
  const { url } = req.body;

  if (!url) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: "URL is required",
      message: 'Request body must contain a "url" field',
    });
  }

  if (typeof url !== "string") {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: "Invalid URL type",
      message: "URL must be a string",
    });
  }

  next();
}

module.exports = {
  analyseUrl,
  validateRequest,
};
