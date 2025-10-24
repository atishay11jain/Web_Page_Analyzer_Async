const express = require("express");
const config = require("../config/app.config");
const {
  createRedisClient,
  closeRedisClient,
} = require("../config/redis.config");
const { initializeQueue, closeQueue } = require("../services/queue.service");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const logger = require("../utils/logger");

const analyseRoutes = require("./routes/analyse.route");
const resultsRoutes = require("./routes/results.route");
const healthRoutes = require("./routes/health.route");

const app = express();

// Middleware
app.use(express.json({ limit: config.api.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.api.bodyLimit }));

// CORS (if enabled)
if (config.api.corsEnabled) {
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  next();
});

// API Routes
app.use("/health", healthRoutes);
app.use("/api/analyse", analyseRoutes);
app.use("/api/results", resultsRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Web Page Analyzer API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: {
        liveness: "GET /health/live",
        readiness: "GET /health/ready",
      },
      analyse: "POST /api/analyse",
      results: "GET /api/results/:job_id",
    },
    documentation: "/api/docs",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

async function initialize() {
  try {
    const redis = createRedisClient();
    await redis.connect();
    logger.info("Redis connected successfully");

    initializeQueue();
    logger.info("Queue initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize dependencies", {
      error: error.message,
    });
    throw error;
  }
}

async function start() {
  try {
    await initialize();

    const server = app.listen(config.port, () => {
      logger.info("API Server started", {
        port: config.port,
      });
    });

    server.timeout = config.api.requestTimeout;

    const shutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      server.close(async () => {
        try {
          await closeQueue();
          logger.info("Queue closed");

          await closeRedisClient();
          logger.info("Redis connection closed");

          process.exit(0);
        } catch (error) {
          logger.error("Error during shutdown", {
            error: error.message,
          });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", {
        error: error.message,
      });
      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled rejection", {
        reason,
      });
      shutdown("UNHANDLED_REJECTION");
    });

    return server;
  } catch (error) {
    logger.error("Failed to start server", {
      error: error.message,
    });
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
