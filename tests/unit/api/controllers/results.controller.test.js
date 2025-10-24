const { getResults } = require('../../../../src/api/controllers/results.controller');
const storageService = require('../../../../src/services/storage.service');
const queueService = require('../../../../src/services/queue.service');
const { HTTP_STATUS, JOB_STATUS } = require('../../../../src/utils/constants');

jest.mock('../../../../src/services/storage.service');
jest.mock('../../../../src/services/queue.service');
jest.mock('../../../../src/utils/logger');

describe('getResults Controller', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      params: {},
      id: 'test-request-id',
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe('Job ID Validation', () => {
    test('should reject invalid job ID format', async () => {
      req.params.job_id = 'invalid-id';

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          details: expect.stringContaining('19-digit'),
        })
      );
    });

    test('should reject job IDs with wrong length', async () => {
      req.params.job_id = '12345';

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    });

    test('should reject non-numeric job IDs', async () => {
      req.params.job_id = 'abcd1234567890123456';

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    });

    test('should accept valid 19-digit numeric job IDs', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        url: 'https://example.com',
        status: JOB_STATUS.PENDING,
        created_at: new Date().toISOString(),
      });

      queueService.getJobInfo.mockResolvedValue({
        found: true,
        position: 1,
        estimatedWait: 5,
      });

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    });
  });

  describe('PENDING Jobs', () => {
    test('should return job with queue position for PENDING status', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        url: 'https://example.com',
        status: JOB_STATUS.PENDING,
        created_at: new Date().toISOString(),
      });

      queueService.getJobInfo.mockResolvedValue({
        found: true,
        position: 3,
        estimatedWait: 15,
      });

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      // When position > 0, status changes to PROCESSING
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: '1234567890123456789',
          status: JOB_STATUS.PROCESSING,
          url: 'https://example.com',
        })
      );
    });

    test('should keep PENDING status if position is 0', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        status: JOB_STATUS.PENDING,
        url: 'https://example.com',
        created_at: new Date().toISOString(),
      });

      queueService.getJobInfo.mockResolvedValue({
        found: true,
        position: 0,
      });

      await getResults(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      // When position is 0, status remains PENDING
      expect(responseData.status).toBe(JOB_STATUS.PENDING);
      expect(responseData.queue_info).toBeUndefined();
    });
  });

  describe('PROCESSING Jobs', () => {
    test('should return job with PROCESSING status', async () => {
      const updatedAt = new Date(Date.now() - 5000).toISOString();
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        status: JOB_STATUS.PROCESSING,
        url: 'https://example.com',
        created_at: new Date().toISOString(),
        updated_at: updatedAt,
      });

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: '1234567890123456789',
          status: JOB_STATUS.PROCESSING,
          url: 'https://example.com',
        })
      );
    });
  });

  describe('COMPLETED Jobs', () => {
    test('should return job with results for COMPLETED status', async () => {
      req.params.job_id = '1234567890123456789';

      const mockResults = {
        html_version: 'HTML 5',
        page_title: 'Test Page',
        headings_count: { h1: 1, h2: 2, h3: 0, h4: 0, h5: 0, h6: 0 },
        internal_links_count: 10,
        external_links_count: 5,
        has_login_form: false,
      };

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        status: JOB_STATUS.COMPLETED,
        url: 'https://example.com',
        created_at: new Date(Date.now() - 10000).toISOString(),
        updated_at: new Date().toISOString(),
        results: mockResults,
      });

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: '1234567890123456789',
          status: JOB_STATUS.COMPLETED,
          url: 'https://example.com',
          results: mockResults,
        })
      );
    });
  });

  describe('FAILED Jobs', () => {
    test('should return job with error details for FAILED status', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        status: JOB_STATUS.FAILED,
        url: 'https://example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: 'Failed to fetch URL: timeout',
      });

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: JOB_STATUS.FAILED,
          error: 'Failed to fetch URL: timeout',
        })
      );
    });

    test('should use default error message if none provided', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        status: JOB_STATUS.FAILED,
        url: 'https://example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await getResults(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.error).toBe('Job processing failed');
    });
  });

  describe('Job Not Found', () => {
    test('should return 404 if job does not exist', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue(null);

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not found'),
          message: expect.stringContaining('1234567890123456789'),
        })
      );
    });
  });

  describe('Storage Failures', () => {
    test('should return 503 if Redis is unavailable', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockRejectedValue(new Error('Redis connection failed'));

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Storage system is unavailable',
        })
      );
    });

    test('should handle Redis timeout errors', async () => {
      req.params.job_id = '1234567890123456789';

      const timeoutError = new Error('Command timed out');
      timeoutError.code = 'ETIMEDOUT';
      storageService.getJob.mockRejectedValue(timeoutError);

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.SERVICE_UNAVAILABLE);
    });
  });

  describe('Unexpected Errors', () => {
    test('should handle unexpected thrown errors in validation', async () => {
      // Pass invalid job_id to trigger validation code path
      req.params.job_id = 'invalid';

      // This should return 400 Bad Request, not call next()
      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Unknown Job Status', () => {
    test('should return 500 for unknown job status', async () => {
      req.params.job_id = '1234567890123456789';

      storageService.getJob.mockResolvedValue({
        job_id: '1234567890123456789',
        status: 'UNKNOWN_STATUS',
        url: 'https://example.com',
        created_at: new Date().toISOString(),
      });

      await getResults(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unknown job status',
        })
      );
    });
  });
});
