const express = require("express");
const router = express.Router();
const storageService = require("../../services/storage.service");

router.get("/live", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

router.get("/ready", async (req, res) => {
  try {
    // Check Redis connection
    await storageService.ping();

    res.status(200).json({
      status: "ok",
      redis: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unavailable",
      redis: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
