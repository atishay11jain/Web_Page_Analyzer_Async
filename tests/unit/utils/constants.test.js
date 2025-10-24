const constants = require("../../../src/utils/constants");

describe("Constants", () => {
  describe("HTTP_STATUS", () => {
    test("should define standard HTTP status codes", () => {
      expect(constants.HTTP_STATUS.OK).toBe(200);
      expect(constants.HTTP_STATUS.ACCEPTED).toBe(202);
      expect(constants.HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(constants.HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
      expect(constants.HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
    });
  });

  describe("JOB_STATUS", () => {
    test("should define all job statuses", () => {
      expect(constants.JOB_STATUS.PENDING).toBe("PENDING");
      expect(constants.JOB_STATUS.PROCESSING).toBe("PROCESSING");
      expect(constants.JOB_STATUS.COMPLETED).toBe("COMPLETED");
      expect(constants.JOB_STATUS.FAILED).toBe("FAILED");
    });

    test("should have string values", () => {
      Object.values(constants.JOB_STATUS).forEach((status) => {
        expect(typeof status).toBe("string");
      });
    });
  });

  describe("ERROR_MESSAGES", () => {
    test("should define error message constants", () => {
      expect(constants.ERROR_MESSAGES).toBeDefined();
      expect(typeof constants.ERROR_MESSAGES.INVALID_JOB_ID).toBe("string");
      expect(typeof constants.ERROR_MESSAGES.JOB_NOT_FOUND).toBe("string");
    });
  });

  describe("TIMING", () => {
    test("should define timing constants if they exist", () => {
      if (constants.TIMING) {
        expect(typeof constants.TIMING).toBe("object");
      }
    });
  });
});
