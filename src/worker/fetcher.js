const axios = require("axios");
const config = require("../config/app.config");
const logger = require("../utils/logger");
const { ERROR_TYPES } = require("../utils/constants");

class FetchError extends Error {
  constructor(
    message,
    statusCode = 0,
    isRetryable = false,
    type = ERROR_TYPES.NETWORK_ERROR
  ) {
    super(message);
    this.name = "FetchError";
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    this.type = type;
  }
}

async function fetchUrl(url, options = {}) {
  try {
    const response = await axios.get(url, {
      timeout: options.timeout || config.fetcher.timeout,
      maxRedirects: options.maxRedirects || config.fetcher.maxRedirects,
      maxContentLength: config.fetcher.maxContentLength,
      headers: {
        "User-Agent": config.fetcher.userAgent,
        ...config.fetcher.headers,
        ...options.headers,
      },
      validateStatus: (status) => status < 600, // Don't throw on any status
      responseType: "text",
      decompress: true,
      signal: options.signal,
    });

    const statusCode = response.status;

    // Handle successful response
    if (statusCode === 200) {
      logger.info("URL fetched successfully", {
        url,
        statusCode,
      });

      return {
        html: response.data,
        statusCode,
        headers: response.headers,
      };
    }

    // Handle redirect responses (shouldn't happen with maxRedirects, but check anyway)
    if (statusCode >= 300 && statusCode < 400) {
      const location = response.headers["location"];
      throw new FetchError(
        `Unexpected redirect (HTTP ${statusCode})`,
        statusCode,
        false,
        ERROR_TYPES.NETWORK_ERROR
      );
    }

    if (statusCode === 404) {
      throw new FetchError("URL not found (HTTP 404)", 404, false);
    }

    if (statusCode === 403) {
      throw new FetchError("Access forbidden (HTTP 403)", 403, false);
    }

    if (statusCode === 410) {
      throw new FetchError("URL gone (HTTP 410)", 410, false);
    }

    if (statusCode === 429) {
      throw new FetchError("Too many requests (HTTP 429)", 429, true);
    }

    if (statusCode >= 400 && statusCode < 500) {
      throw new FetchError(
        `Client error (HTTP ${statusCode})`,
        statusCode,
        false
      );
    }

    if (statusCode >= 500 && statusCode < 600) {
      throw new FetchError(
        `Server error (HTTP ${statusCode})`,
        statusCode,
        true
      );
    }

    throw new FetchError(
      `Unexpected status (HTTP ${statusCode})`,
      statusCode,
      false
    );
  } catch (error) {
    // Handle axios-specific errors
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      logger.warn("Request timeout", { url, error: error.message });
      throw new FetchError(
        "Request timeout - server took too long to respond",
        0,
        true,
        ERROR_TYPES.TIMEOUT_ERROR
      );
    }

    if (error.code === "ENOTFOUND") {
      logger.warn("Domain not found", { url, error: error.message });
      throw new FetchError(
        "Domain not found (DNS error)",
        0,
        false,
        ERROR_TYPES.NETWORK_ERROR
      );
    }

    if (error.code === "ECONNREFUSED") {
      logger.warn("Connection refused", { url, error: error.message });
      throw new FetchError(
        "Connection refused - server is not accepting connections",
        0,
        true,
        ERROR_TYPES.NETWORK_ERROR
      );
    }

    if (error.code === "ECONNRESET") {
      logger.warn("Connection reset", { url, error: error.message });
      throw new FetchError(
        "Connection reset by server",
        0,
        true,
        ERROR_TYPES.NETWORK_ERROR
      );
    }

    if (
      error.code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
      error.code === "CERT_HAS_EXPIRED"
    ) {
      logger.warn("SSL certificate error", { url, error: error.message });
      throw new FetchError(
        "SSL certificate error - certificate is invalid or expired",
        0,
        false,
        ERROR_TYPES.NETWORK_ERROR
      );
    }

    if (error.code === "ERR_TOO_MANY_REDIRECTS") {
      logger.warn("Too many redirects", { url, error: error.message });
      throw new FetchError(
        "Too many redirects",
        0,
        false,
        ERROR_TYPES.NETWORK_ERROR
      );
    }

    // Handle content too large
    if (error.code === "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED") {
      logger.warn("Content too large", { url, error: error.message });
      throw new FetchError(
        "Content too large - exceeds 10MB limit",
        0,
        false,
        ERROR_TYPES.NETWORK_ERROR
      );
    }

    // If it's already a FetchError, rethrow
    if (error instanceof FetchError) {
      throw error;
    }

    logger.error("Unknown fetch error", {
      url,
      error: error.message,
      code: error.code,
    });
    throw new FetchError(
      error.message || "Unknown fetch error",
      0,
      false,
      ERROR_TYPES.NETWORK_ERROR
    );
  }
}

async function fetchUrlWithRetry(url, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchUrl(url);
      return result;
    } catch (error) {
      lastError = error;

      logger.warn(`Fetch attempt ${attempt}/${maxRetries} failed`, {
        url,
        error: error.message,
        statusCode: error.statusCode,
        isRetryable: error.isRetryable,
      });

      // Don't retry if not retryable
      if (error instanceof FetchError && !error.isRetryable) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      logger.debug(`Retrying after ${delay}ms`, { url, attempt });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function validateHtmlContent(html) {
  if (!html || typeof html !== "string") {
    return false;
  }

  // Check minimum length
  if (html.length < 100) {
    logger.warn("HTML content too short", { length: html.length });
    return false;
  }

  if (
    !html.toLowerCase().includes("<html") &&
    !html.toLowerCase().includes("<!doctype")
  ) {
    logger.warn("No HTML structure found");
    return false;
  }

  return true;
}

module.exports = {
  fetchUrl,
  fetchUrlWithRetry,
  validateHtmlContent,
  FetchError,
};
