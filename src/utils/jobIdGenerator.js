/**
 * Generates unique numeric-only job IDs for large-scale systems
 *
 * Format: TTTTTTTTTTTTTRRRRRR (19 digits)
 * - First 13 digits: Timestamp in milliseconds (ensures chronological ordering)
 * - Last 6 digits: Random number (prevents collisions within same millisecond)
 **/

let lastTimestamp = 0;
let sequence = 0;

function generateNumericJobId() {
  let timestamp = Date.now();

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1) % 1000000;

    if (sequence === 0) {
      while (timestamp <= lastTimestamp) {
        timestamp = Date.now();
      }
    }
  } else {
    sequence = Math.floor(Math.random() * 1000000);
  }

  lastTimestamp = timestamp;

  const sequencePadded = sequence.toString().padStart(6, "0");

  const jobId = `${timestamp}${sequencePadded}`;

  return jobId;
}

function getTimestampFromJobId(jobId) {
  if (!jobId || jobId.length < 13) {
    throw new Error("Invalid job ID format");
  }

  const timestamp = parseInt(jobId.substring(0, 13), 10);

  if (isNaN(timestamp)) {
    throw new Error("Invalid timestamp in job ID");
  }

  return timestamp;
}

function isValidJobId(jobId) {
  if (typeof jobId !== "string") {
    return false;
  }

  if (!/^\d{19}$/.test(jobId)) {
    return false;
  }

  try {
    const timestamp = getTimestampFromJobId(jobId);
    const year2000 = 946684800000;
    const year2100 = 4102444800000;
    return timestamp >= year2000 && timestamp <= year2100;
  } catch (error) {
    return false;
  }
}

module.exports = {
  generateNumericJobId,
  getTimestampFromJobId,
  isValidJobId,
};
