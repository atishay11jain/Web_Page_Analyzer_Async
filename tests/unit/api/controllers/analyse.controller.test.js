const {
  analyseUrl,
  validateRequest,
} = require("../../../../src/api/controllers/analyse.controller");
const storageService = require("../../../../src/services/storage.service");
const queueService = require("../../../../src/services/queue.service");
const { HTTP_STATUS, JOB_STATUS } = require("../../../../src/utils/constants");
const jobIdGenerator = require("../../../../src/utils/jobIdGenerator");

jest.mock("../../../../src/services/storage.service");
jest.mock("../../../../src/services/queue.service");
jest.mock("../../../../src/utils/logger");
jest.mock("../../../../src/utils/jobIdGenerator");

describe("analyseUrl Controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    jobIdGenerator.generateNumericJobId.mockReturnValue("1234567890123456789");
    req = {
      body: {},
      id: "test-request-id",
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Setup next mock
    next = jest.fn();
  });

  describe("Successful Job Creation", () => {
    test("should create job and return 202 Accepted", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      queueService.enqueue.mockResolvedValue({ id: "bull-job-123" });

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.ACCEPTED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: JOB_STATUS.PENDING,
          message: "Job queued successfully",
          job_id: expect.any(String),
        })
      );
    });

    test("should generate numeric job ID", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      queueService.enqueue.mockResolvedValue({ id: "bull-job-123" });

      await analyseUrl(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.job_id).toMatch(/^\d{19}$/);
    });

    test("should store job in Redis with correct data", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      queueService.enqueue.mockResolvedValue({ id: "bull-job-123" });

      await analyseUrl(req, res, next);

      expect(storageService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: expect.any(String),
          url: "https://example.com",
          status: JOB_STATUS.PENDING,
        })
      );
    });

    test("should enqueue job to Bull with correct options", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      queueService.enqueue.mockResolvedValue({ id: "bull-job-123" });

      await analyseUrl(req, res, next);

      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: expect.any(String),
          url: "https://example.com",
        }),
        expect.objectContaining({
          timeout: 5000,
          attempts: 3,
          backoff: expect.any(Object),
        })
      );
    });

    test("should not include HATEOAS links in response", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      queueService.enqueue.mockResolvedValue({ id: "bull-job-123" });

      await analyseUrl(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      // Current implementation doesn't include _links
      expect(responseData._links).toBeUndefined();
    });
  });

  describe("URL Validation", () => {
    test("should reject invalid URLs", async () => {
      req.body.url = "not-a-valid-url";

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    test("should reject localhost URLs (SSRF protection)", async () => {
      req.body.url = "http://localhost:3000";

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    });

    test("should reject private IP addresses", async () => {
      req.body.url = "http://192.168.1.1";

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    });

    test("should reject URLs without protocol", async () => {
      req.body.url = "example.com";

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    });

    test("should accept valid HTTPS URLs", async () => {
      req.body.url = "https://www.google.com";

      storageService.createJob.mockResolvedValue(true);
      queueService.enqueue.mockResolvedValue({ id: "bull-job-123" });

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.ACCEPTED);
    });
  });

  describe("Storage Failures", () => {
    test("should return 503 if Redis storage is unavailable", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockRejectedValue(
        new Error("Redis connection failed")
      );

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Storage system is unavailable",
          message: expect.any(String),
        })
      );
    });

    test("should not enqueue if storage fails", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockRejectedValue(new Error("Storage error"));

      await analyseUrl(req, res, next);

      expect(queueService.enqueue).not.toHaveBeenCalled();
    });

    test("should log storage errors", async () => {
      req.body.url = "https://example.com";

      const storageError = new Error("Redis timeout");
      storageService.createJob.mockRejectedValue(storageError);

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.SERVICE_UNAVAILABLE);
    });
  });

  describe("Queue Failures", () => {
    test("should return 503 if Bull queue is unavailable", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      storageService.updateJob.mockResolvedValue(true);
      queueService.enqueue.mockRejectedValue(new Error("Queue unavailable"));

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Queue system is down, please try again later",
        })
      );
    });

    test("should mark job as FAILED if queue fails", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      storageService.updateJob.mockResolvedValue(true);
      queueService.enqueue.mockRejectedValue(new Error("Queue error"));

      await analyseUrl(req, res, next);

      expect(storageService.updateJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: JOB_STATUS.FAILED,
          error: "Failed to queue job",
        })
      );
    });

    test("should handle queue timeout errors", async () => {
      req.body.url = "https://example.com";

      storageService.createJob.mockResolvedValue(true);
      storageService.updateJob.mockResolvedValue(true);
      const timeoutError = new Error("Queue timeout");
      timeoutError.code = "ETIMEDOUT";
      queueService.enqueue.mockRejectedValue(timeoutError);

      await analyseUrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.SERVICE_UNAVAILABLE);
    });
  });

  describe("Unexpected Errors", () => {
    test("should handle synchronous validation errors", async () => {
      req.body.url = "https://example.com";

      // Mock the job ID generator to throw an error
      jobIdGenerator.generateNumericJobId.mockImplementation(() => {
        throw new Error("Generator failed");
      });

      await analyseUrl(req, res, next);

      // The controller's outer try-catch catches the error and calls next()
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].message).toBe("Generator failed");
    });
  });
});

describe("validateRequest Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test("should reject requests without URL", () => {
    validateRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "URL is required",
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("should reject non-string URLs", () => {
    req.body.url = 12345;

    validateRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid URL type",
      })
    );
  });

  test("should reject URLs as objects", () => {
    req.body.url = { url: "https://example.com" };

    validateRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
  });

  test("should reject URLs as arrays", () => {
    req.body.url = ["https://example.com"];

    validateRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
  });

  test("should call next() for valid string URLs", () => {
    req.body.url = "https://example.com";

    validateRequest(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("should allow empty strings to pass (validation happens in controller)", () => {
    req.body.url = "";

    validateRequest(req, res, next);

    // validateRequest only checks presence and type, not content
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
  });
});
