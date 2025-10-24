const storageService = require("../../services/storage.service");
const queueService = require("../../services/queue.service");
const logger = require("../../utils/logger");
const { isValidJobId } = require("../../utils/jobIdGenerator");
const {
  HTTP_STATUS,
  JOB_STATUS,
  ERROR_MESSAGES,
} = require("../../utils/constants");

async function getResults(req, res, next) {
  const { job_id } = req.params;

  try {
    if (!isValidJobId(job_id)) {
      logger.warn("Invalid job_id format", {
        job_id,
        requestId: req.id,
      });

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.INVALID_JOB_ID,
        details: "Job ID must be a 19-digit numeric string",
      });
    }

    // 2. Get job from Redis
    let job;
    try {
      job = await storageService.getJob(job_id);
    } catch (storageError) {
      logger.error("Storage error while fetching job", {
        job_id,
        error: storageError.message,
        requestId: req.id,
      });

      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: ERROR_MESSAGES.STORAGE_UNAVAILABLE,
        message: "Unable to retrieve job. Please try again.",
        timestamp: new Date().toISOString(),
      });
    }

    if (!job) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.JOB_NOT_FOUND,
        message: `No job found with ID: ${job_id}`,
        timestamp: new Date().toISOString(),
      });
    }

    const response = {
      job_id: job.job_id,
      status: job.status,
      url: job.url,
    };

    if (job.status === JOB_STATUS.PENDING) {
      const queueInfo = await queueService.getJobInfo(job_id);

      if (queueInfo.found && queueInfo.position > 0) {
        response.status = JOB_STATUS.PROCESSING;
      }

      return res.status(HTTP_STATUS.OK).json(response);
    }

    if (job.status === JOB_STATUS.PROCESSING) {
      return res.status(HTTP_STATUS.OK).json(response);
    }

    if (job.status === JOB_STATUS.COMPLETED) {
      response.results = job.results;
      return res.status(HTTP_STATUS.OK).json(response);
    }

    if (job.status === JOB_STATUS.FAILED) {
      response.error = job.error || "Job processing failed";

      return res.status(HTTP_STATUS.OK).json(response);
    }

    logger.error("Unknown job status", {
      job_id,
      status: job.status,
      requestId: req.id,
    });

    response.error = "Unknown job status";
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
  } catch (error) {
    logger.error("Unexpected error in getResults", {
      error: error.message,
      stack: error.stack,
      job_id,
      requestId: req.id,
    });
    next(error);
  }
}

module.exports = {
  getResults,
};
