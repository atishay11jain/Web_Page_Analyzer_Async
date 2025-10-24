const {
  generateNumericJobId,
  isValidJobId,
  getTimestampFromJobId,
} = require("../../../src/utils/jobIdGenerator");

describe("generateNumericJobId", () => {
  describe("Format Validation", () => {
    test("should return a 19-digit numeric string", () => {
      const jobId = generateNumericJobId();
      expect(jobId).toMatch(/^\d{19}$/);
      expect(jobId.length).toBe(19);
    });

    test("should contain only digits (0-9)", () => {
      const jobId = generateNumericJobId();
      expect(jobId).toMatch(/^[0-9]+$/);
    });

    test("should start with current timestamp (first 13 digits)", () => {
      const before = Date.now();
      const jobId = generateNumericJobId();
      const after = Date.now();

      const timestamp = parseInt(jobId.substring(0, 13), 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("Uniqueness", () => {
    test("should generate unique IDs for sequential calls", () => {
      const id1 = generateNumericJobId();
      const id2 = generateNumericJobId();
      const id3 = generateNumericJobId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    test("should generate different IDs when called 1000 times in a loop", () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateNumericJobId());
      }
      expect(ids.size).toBe(1000);
    });

    test("should generate unique IDs when called in same millisecond", async () => {
      const ids = [];
      // Generate multiple IDs as fast as possible
      for (let i = 0; i < 100; i++) {
        ids.push(generateNumericJobId());
      }

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("Concurrency", () => {
    test("should handle concurrent ID generations without duplicates", async () => {
      const promises = Array(100)
        .fill(null)
        .map(() => Promise.resolve(generateNumericJobId()));

      const ids = await Promise.all(promises);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(100);
    });
  });

  describe("Edge Cases", () => {
    test("should increment sequence when called in same millisecond", () => {
      const ids = [];
      const startTime = Date.now();

      while (Date.now() === startTime && ids.length < 10) {
        ids.push(generateNumericJobId());
      }

      if (ids.length > 1) {
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }
    });
  });
});

describe("isValidJobId", () => {
  describe("Valid Job IDs", () => {
    test("should validate correctly formatted job IDs", () => {
      const jobId = generateNumericJobId();
      expect(isValidJobId(jobId)).toBe(true);
    });

    test("should validate job ID with current timestamp", () => {
      const timestamp = Date.now().toString();
      const sequence = "123456";
      const jobId = timestamp + sequence;
      expect(isValidJobId(jobId)).toBe(true);
    });
  });

  describe("Invalid Job IDs", () => {
    test("should reject IDs with wrong length", () => {
      expect(isValidJobId("12345")).toBe(false);
      expect(isValidJobId("12345678901234567890")).toBe(false); // 20 digits
    });

    test("should reject IDs with non-numeric characters", () => {
      expect(isValidJobId("1234567890123abc456")).toBe(false);
      expect(isValidJobId("abcdefghijklmnopqrs")).toBe(false);
    });

    test("should reject IDs with special characters", () => {
      expect(isValidJobId("1234567890123-45678")).toBe(false);
      expect(isValidJobId("1234567890123 45678")).toBe(false);
    });

    test("should reject IDs with timestamps from year 1970", () => {
      const oldTimestamp = "0000000000001"; // Very old timestamp
      const jobId = oldTimestamp + "123456";
      expect(isValidJobId(jobId)).toBe(false);
    });

    test("should reject IDs with future timestamps (year 2200)", () => {
      const futureTimestamp = "9999999999999"; // Year ~2286
      const jobId = futureTimestamp + "123456";
      expect(isValidJobId(jobId)).toBe(false);
    });

    test("should reject null or undefined", () => {
      expect(isValidJobId(null)).toBe(false);
      expect(isValidJobId(undefined)).toBe(false);
    });

    test("should reject non-string values", () => {
      expect(isValidJobId(1234567890123456789)).toBe(false);
      expect(isValidJobId({})).toBe(false);
      expect(isValidJobId([])).toBe(false);
    });

    test("should reject empty strings", () => {
      expect(isValidJobId("")).toBe(false);
    });
  });
});

describe("getTimestampFromJobId", () => {
  describe("Successful Extraction", () => {
    test("should extract correct timestamp from job ID", () => {
      const before = Date.now();
      const jobId = generateNumericJobId();
      const after = Date.now();

      const timestamp = getTimestampFromJobId(jobId);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    test("should return milliseconds since epoch", () => {
      const jobId = generateNumericJobId();
      const timestamp = getTimestampFromJobId(jobId);

      expect(timestamp).toBeGreaterThan(946684800000); // Jan 1, 2000
      expect(timestamp).toBeLessThan(4102444800000); // Jan 1, 2100
    });

    test("should extract timestamp that matches job creation time", () => {
      const creationTime = Date.now();
      const jobId = generateNumericJobId();
      const extractedTime = getTimestampFromJobId(jobId);

      // Should be within 1 second
      expect(Math.abs(extractedTime - creationTime)).toBeLessThan(1000);
    });
  });

  describe("Error Handling", () => {
    test("should throw error for invalid job ID", () => {
      expect(() => getTimestampFromJobId("invalid")).toThrow();
    });

    test("should throw error for job ID with wrong length", () => {
      expect(() => getTimestampFromJobId("12345")).toThrow();
    });

    test("should throw error for null or undefined", () => {
      expect(() => getTimestampFromJobId(null)).toThrow();
      expect(() => getTimestampFromJobId(undefined)).toThrow();
    });
  });
});
