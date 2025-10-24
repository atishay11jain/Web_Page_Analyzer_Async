const storageService = require("../services/storage.service");
const { fetchUrlWithRetry } = require("./fetcher");
const { parseHtml, validateResults } = require("./parser");
const logger = require("../utils/logger");
const { JOB_STATUS } = require("../utils/constants");

async function processJob(job_id, url) {
  const startTime = Date.now();

  try {
    const updated = await storageService.updateJobIfPending(job_id, {
      status: JOB_STATUS.PROCESSING,
    });

    if (!updated) {
      return {
        success: false,
        reason: "Job already processing or completed",
      };
    }

    logger.info("Job status updated to PROCESSING", { job_id });

    // 2. Fetch HTML content
    let html, statusCode, headers;
    try {
      const fetchResult = await fetchUrlWithRetry(url, 3);
      html = fetchResult.html;
      statusCode = fetchResult.statusCode;
      headers = fetchResult.headers;

      logger.info("URL fetched successfully", {
        job_id,
        url,
        statusCode,
      });
    } catch (fetchError) {
      logger.error("Failed to fetch URL", {
        job_id,
        url,
        error: fetchError.message,
        statusCode: fetchError.statusCode,
        isRetryable: fetchError.isRetryable,
      });

      // Determine if we should retry
      if (fetchError.isRetryable) {
        // Let Bull retry the job
        throw fetchError;
      } else {
        // Non-retryable error - mark as failed
        await storageService.updateJob(job_id, {
          status: JOB_STATUS.FAILED,
          error: fetchError.message,
          error_type: fetchError.type,
        });

        logger.info("Job marked as FAILED (non-retryable)", {
          job_id,
          error: fetchError.message,
        });

        return {
          success: false,
          error: fetchError.message,
          retryable: false,
        };
      }
    }

    // 3. Parse HTML
    let results;
    try {
      results = parseHtml(html, url);

      // Validate results structure
      if (!validateResults(results)) {
        throw new Error("Invalid parsing results structure");
      }

      logger.info("HTML parsed successfully", {
        job_id,
        htmlVersion: results.html_version,
        title: results.page_title,
      });
    } catch (parseError) {
      // Parsing errors are non-retryable
      await storageService.updateJob(job_id, {
        status: JOB_STATUS.FAILED,
        error: `Failed to parse HTML: ${parseError.message}`,
        error_type: "PARSE_ERROR",
      });

      logger.info("Job marked as FAILED (parse error)", {
        job_id,
        error: parseError.message,
      });

      return {
        success: false,
        error: parseError.message,
        retryable: false,
      };
    }

    // 4. Save results to Redis
    try {
      const processingTime = Date.now() - startTime;

      await storageService.updateJob(job_id, {
        status: JOB_STATUS.COMPLETED,
        results,
        http_status_code: statusCode,
      });

      logger.info("Job completed successfully", {
        job_id,
        url,
        processingTime: `${processingTime}ms`,
        htmlVersion: results.html_version,
      });

      return {
        success: true,
        results,
      };
    } catch (storageError) {
      logger.error("Failed to save results", {
        job_id,
        error: storageError.message,
      });

      // Storage error - should retry
      throw storageError;
    }
  } catch (error) {
    logger.error("Job processing failed with unexpected error", {
      job_id,
      url,
      error: error.message,
      stack: error.stack,
    });

    // Try to update job status to failed
    try {
      await storageService.updateJob(job_id, {
        status: JOB_STATUS.FAILED,
        error: error.message || "Unknown processing error",
        error_type: error.type || "UNKNOWN_ERROR",
      });
    } catch (updateError) {
      logger.error("Failed to update job status after error", {
        job_id,
        error: updateError.message,
      });
    }

    // Rethrow to let Bull handle
    throw error;
  }
}

/**
 * Batch process multiple jobs
 * @param {Array} jobs - Array of jobs to process
 * @returns {Promise<object>} Batch processing results
 */
async function batchProcessJobs(jobs) {
  const results = {
    total: jobs.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (const job of jobs) {
    try {
      const result = await processJob(job.job_id, job.url);
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          job_id: job.job_id,
          error: result.error,
        });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        job_id: job.job_id,
        error: error.message,
      });
    }
  }

  logger.info("Batch processing completed", results);
  return results;
}

module.exports = {
  processJob,
  batchProcessJobs,
};
