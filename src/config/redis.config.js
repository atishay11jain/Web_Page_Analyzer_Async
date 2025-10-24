const Redis = require("ioredis");
const config = require("./app.config");
const logger = require("../utils/logger");

let redisClient = null;

function createRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis({
    ...config.redis,
    lazyConnect: true,
    reconnectOnError: (err) => {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) {
        // Reconnect on READONLY errors
        return true;
      }
      return false;
    },
  });

  // Connection event handlers
  redisClient.on("connect", () => {
    logger.info("Redis client connecting", {
      host: config.redis.host,
      port: config.redis.port,
    });
  });

  redisClient.on("ready", () => {
    logger.info("Redis client ready");
  });

  redisClient.on("error", (error) => {
    logger.error("Redis client error", {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  });

  redisClient.on("close", () => {
    logger.warn("Redis connection closed");
  });

  redisClient.on("reconnecting", (delay) => {
    logger.info("Redis client reconnecting", { delay });
  });

  redisClient.on("end", () => {
    logger.warn("Redis connection ended");
  });

  return redisClient;
}

function getRedisClient() {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
}

async function closeRedisClient() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info("Redis connection closed gracefully");
  }
}

async function checkRedisHealth() {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    logger.error("Redis health check failed", { error: error.message });
    return false;
  }
}

module.exports = {
  createRedisClient,
  getRedisClient,
  closeRedisClient,
  checkRedisHealth,
};
