const express = require("express");
const { getResults } = require("../controllers/results.controller");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.get("/:job_id", asyncHandler(getResults));

module.exports = router;
