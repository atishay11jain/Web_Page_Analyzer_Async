const express = require("express");
const {
  analyseUrl,
  validateRequest,
} = require("../controllers/analyse.controller");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.post("/", validateRequest, asyncHandler(analyseUrl));

module.exports = router;
