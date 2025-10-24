const logger = require("../../utils/logger");
const { HTTP_STATUS, ERROR_TYPES } = require("../../utils/constants");

function formatErrorResponse(error, req) {
  const response = {
    error: error.message || "Internal server error",
    path: req.path,
    method: req.method,
  };

  if (error.details) {
    response.details = error.details;
  }

  if (error.type) {
    response.type = error.type;
  }

  if (req.id) {
    response.requestId = req.id;
  }

  return response;
}

function getStatusCode(error) {
  if (error.statusCode) {
    return error.statusCode;
  }

  // Check error type
  switch (error.type) {
    case ERROR_TYPES.VALIDATION_ERROR:
      return HTTP_STATUS.BAD_REQUEST;

    case ERROR_TYPES.NOT_FOUND_ERROR:
      return HTTP_STATUS.NOT_FOUND;

    case ERROR_TYPES.QUEUE_ERROR:
    case ERROR_TYPES.STORAGE_ERROR:
      return HTTP_STATUS.SERVICE_UNAVAILABLE;

    case ERROR_TYPES.TIMEOUT_ERROR:
    case ERROR_TYPES.NETWORK_ERROR:
      return HTTP_STATUS.BAD_REQUEST;

    default:
      return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = getStatusCode(err);
  const errorResponse = formatErrorResponse(err, req);

  // Log error with context
  logger.error("Request error", {
    error: err.message,
    type: err.type,
    statusCode,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json(errorResponse);
}

function notFoundHandler(req, res) {
  const response = {
    error: "Route not found",
    message: `Cannot ${req.method} ${req.path}`,
  };

  res.status(HTTP_STATUS.NOT_FOUND).json(response);
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
