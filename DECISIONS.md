# Architecture & Design Decisions

This document explains the key architectural choices, scalability considerations, error handling strategies, and testing approach for the Web Page Analyzer service.

---

## Table of Contents

1. [Architectural Choices](#1-architectural-choices)
2. [Scalability](#2-scalability)
3. [Error Handling & Resiliency](#3-error-handling--resiliency)
4. [Testing Strategy](#4-testing-strategy)

---

## 1. Architectural Choices

### High-Level Architecture Overview

The Web Page Analyzer follows a **microservices-oriented architecture** with three main components:

```
        ┌──────────────┐
        │  API Server  │
        │  (Express)   │
        │   Port 3000  │
        └───────┬──────┘
                │
                │
        ┌───────▼──────────┐
        │      Redis       │
        │  Storage + Queue │
        │    Port 6379     │
        └───────┬──────────┘
                │
    ┌───────────┴───────────┐
    │                       │
┌───▼──────┐        ┌───────▼──────┐
│  Worker  │        │    Worker    │
│Process 1 │  ...   │   Process N  │
└──────────┘        └──────────────┘
```

**Design Pattern:** Producer-Consumer Pattern

- **Producer:** API server receives requests and creates jobs
- **Queue:** Redis + Bull.js manage job distribution
- **Consumer:** Worker processes execute jobs asynchronously

---

### Framework Choice: Express.js

**Decision:** Express.js (Node.js)

**Why Express.js?**

✅ **Pros:**

1. **Mature Ecosystem:** Extensive middleware and library support
2. **Hands On Experience:** For tight deadline and easy implementation
3. **Async-First:** Node.js event loop perfect for I/O-heavy tasks (HTTP fetching)
4. **Cheerio Integration:** Excellent HTML parsing library (jQuery-like syntax)
5. **Bull.js Support:** Best-in-class job queue for Node.js with Redis
6. **Fast Startup:** Lightweight compared to Python frameworks
7. **Single Language:** JavaScript for both API and worker simplifies deployment
8. **Community:** Massive community, easy to find solutions

---

### Background Job Queue: Bull.js + Redis

**Decision:** Bull (Node.js library) with Redis as backing store

**Alternatives Considered:**

- **RabbitMQ** - Overkill for this use case, complex setup
- **AWS SQS** - Cloud-dependent, needs Account and configurations also can cost money

**Why Bull + Redis?**

✅ **Pros:**

1. **Persistence:** Redis persists jobs across restarts
2. **Atomic Operations:** Redis ensures no duplicate processing
3. **Priority Queues:** Can prioritize certain jobs (future feature)
4. **Delayed Jobs:** Can schedule jobs for later
5. **Retry Logic:** Built-in exponential backoff
6. **Job Progress:** Can track job progress in real-time
7. **Dashboard:** Bull Board provides UI for queue monitoring
8. **Performance:** Redis is extremely fast (100k+ ops/sec)
9. **Distributed:** Multiple workers can share the same queue
10. **Battle-Tested:** Used by companies like Uber, Netflix

---

### Data Storage: Redis

**Decision:** Redis for temporary job storage

**Alternatives Considered:**

- **MongoDB** - Document store, but we need fast key-value access

**Why Redis?**

✅ **Pros:**

1. **Speed:** Sub-millisecond read/write latency
2. **Simple Data Model:** Key-value storage perfect for job records
3. **TTL Support:** Auto-expire old jobs (set to 24 hours)
4. **Atomic Operations:** `GETSET`, `SETNX` prevent race conditions
5. **Dual Purpose:** Both storage and queue backing store
6. **Minimal Schema:** No migrations needed
7. **Scales Horizontally:** Redis Cluster for high availability

**Data Schema:**

```
Key: "job:{job_id}"
Value: JSON object
{
  "job_id": "1234567890123456789",
  "url": "https://example.com",
  "status": "COMPLETED",
  "created_at": "2024-10-24T12:00:00.000Z",
  "updated_at": "2024-10-24T12:00:05.000Z",
  "results": { ... }
}
TTL: 86400 seconds (24 hours)
```

---

### Job ID Generation: Timestamp + Sequence

**Decision:** Custom 19-digit numeric IDs (13-digit timestamp + 6-digit sequence)

**Alternatives Considered:**

- **UUID v4** - Too long (36 chars), contains hyphens
- **ULID** - 26 chars, alphanumeric, not purely numeric
- **Auto-increment** - Requires centralized counter, not distributed-safe
- **Snowflake ID** - Complex, requires machine ID coordination

**Why Custom Numeric IDs?**

✅ **Pros:**

1. **Numeric Only:** Easy to type, URL-friendly
2. **Sortable:** IDs naturally sort by creation time
3. **No Collisions:** Timestamp + sequence guarantees uniqueness
4. **Distributed Safe:** Works across multiple API servers
5. **Human Readable:** Can extract creation timestamp
6. **Fixed Length:** Always 19 digits for validation

**Capacity:**

- 1 million unique IDs per millisecond
- Sufficient for 1 billion requests/second

---

### Security: SSRF Protection

**Decision:** Joi validation + IP address blocking

**Threat:** Server-Side Request Forgery (SSRF)

- Attacker submits URL like `http://localhost:3000/admin`
- Our server would fetch internal resources
- Could expose sensitive endpoints

**Protection Layers:**

1. **Protocol Whitelist:** Only HTTP/HTTPS allowed

   ```javascript
   url.protocol === "http:" || url.protocol === "https:";
   ```

2. **Private IP Blocking:**

   ```javascript
   const PRIVATE_IP_RANGES = [
     /^127\./, // Localhost
     /^10\./, // Private Class A
     /^192\.168\./, // Private Class C
     /^172\.(1[6-9]|2\d|3[01])\./, // Private Class B
   ];
   ```

3. **Hostname Blocking:**

   ```javascript
   const BLOCKED_HOSTS = ["localhost", "0.0.0.0", "::1"];
   ```

4. **AWS Metadata Endpoint:**
   ```javascript
   if (hostname === "169.254.169.254") {
     return { valid: false, error: "SSRF attempt detected" };
   }
   ```

---

## 2. Scalability

### Current Capacity

**Single Server Setup:**

- API Server: ~1000 req/sec (limited by Node.js event loop)
- Worker: ~5-10 jobs/sec (limited by HTTP fetch latency)
- Redis: ~100,000 ops/sec (plenty of headroom)

**Bottleneck:** Workers (HTML fetching is slow)

---

### Handling 10,000 Analysis Requests Per Minute

**Challenge:** 10,000 requests/min = 167 requests/second

**Current Bottlenecks:**

1. **API Server:**

   - **Bottleneck:** Single instance maxes out at ~1000 req/sec
   - **Impact:** Not a bottleneck yet (167 << 1000)

2. **Worker:**

   - **Bottleneck:** Each worker processes ~5-10 jobs/sec
   - **Current:** 2 workers = 10-20 jobs/sec = 600-1200 jobs/min
   - **Impact:** **CRITICAL BOTTLENECK** (need 10x more capacity)

3. **Redis:**
   - **Bottleneck:** Can handle 100k ops/sec
   - **Impact:** No bottleneck

---

### Evolution Strategy for 10k Requests/Minute

#### Phase 1: Horizontal Scaling (Immediate - 10k req/min)

```
┌─────────────────┐
│  Load Balancer  │  (NGINX or AWS ALB)
│   (Round Robin) │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼───┐
│ API 1 │ │ API 2│ │ API 3│ │ API 4│  (4 instances)
└───┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
    └────────┴────┬───┴────────┘
                  │
         ┌────────▼─────────┐
         │  Redis Cluster   │  (Master + 2 Replicas)
         │  (High Availab.) │
         └────────┬─────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐   ┌────▼────┐   ┌────▼────┐
│Worker │   │ Worker  │   │ Worker  │  (50+ workers)
│ 1-20  │   │ 21-40   │   │ 41-60   │
└───────┘   └─────────┘   └─────────┘
```

**Changes:**

1. **API Layer:**

   - Deploy 4 API instances behind NGINX load balancer
   - Use health checks (`/health` endpoint)
   - **Capacity:** 4,000 req/sec (plenty of headroom)

2. **Worker Layer:**

   - Deploy 50 worker instances (2 concurrent jobs each)
   - **Calculation:** 50 workers × 2 jobs × 5/sec = 500 jobs/sec = 30,000 jobs/min
   - **Headroom:** 3x capacity for spikes

3. **Redis Layer:**
   - Upgrade to Redis Cluster (3 masters, 3 replicas)
   - Enable Redis Sentinel for automatic failover
   - **Capacity:** Still has 10x headroom

**Cost Estimate:**

- 4 API instances: $200/month (AWS t3.medium)
- 50 Worker instances: $500/month (AWS t3.small)
- Redis Cluster: $300/month (AWS ElastiCache)
- **Total:** ~$1000/month

---

#### Phase 2: Optimization (100k req/min)

If we need to scale 10x further:

1. **Database Layer:**

   - Move from Redis to MongoDB for long-term storage
   - Keep Redis only for active jobs (last 1 hour)
   - Archive old results to S3

2. **Rate Limiting:**

   ```javascript
   // Prevent abuse
   const rateLimit = require("express-rate-limit");
   app.use(
     rateLimit({
       windowMs: 60 * 1000, // 1 minute
       max: 100, // Max 100 requests per IP
     })
   );
   ```

3. **Job Prioritization:**

4. **CDN for Static Assets:**
   - Serve API documentation via CDN
   - Reduce load on API servers

---

#### Phase 3: Geographic Distribution (Global Scale)

For worldwide deployment:

```
┌──────────────────────────────────────────────┐
│         Global Load Balancer (Route 53)      │
└──┬────────────────┬────────────────┬─────────┘
   │                │                │
   │ US-East        │ EU-West        │ Asia-Pacific
   │                │                │
┌──▼──────────┐  ┌──▼──────────┐  ┌──▼──────────┐
│ API Cluster │  │ API Cluster │  │ API Cluster │
│ Workers     │  │ Workers     │  │ Workers     │
│ Redis       │  │ Redis       │  │ Redis       │
└─────────────┘  └─────────────┘  └─────────────┘
```

**Benefits:**

- Reduced latency (users hit nearest datacenter)
- Fault tolerance (region outage doesn't kill service)
- Compliance (GDPR data stays in EU)

---

### Database Evolution

**Current:** Redis (in-memory, temporary)

**Future Scaling Path:**

```
Phase 1: Redis Only
  ↓
Phase 2: Redis (hot) + MongoDB (cold storage)
  ↓
Phase 3: Redis + MongoDB + S3 (archive)
```

**Reasoning:**

- Redis excels at temporary, fast access
- MongoDB better for long-term, JSON queries on multiple different fields
- S3 cheapest for archival (old results)

---

## 3. Error Handling & Resiliency

### Error Categories

Our system handles 5 types of errors:

1. **Validation Errors** (4xx)
2. **Network Errors** (fetch failures)
3. **Storage Errors** (Redis down)
4. **Queue Errors** (Bull failures)
5. **Unexpected Errors** (bugs)

---

### Handling Unavailable URLs

**Scenario:** User submits `https://example.com/nonexistent`

**What Happens:**

1. **Job Created:**

   ```javascript
   // Job is PENDING in Redis
   { job_id: "123", status: "PENDING", url: "..." }
   ```

2. **Worker Fetches URL:**

   ```javascript
   // src/worker/fetcher.js
   try {
     const response = await axios.get(url, { timeout: 5000 });
     if (response.status === 404) {
       throw new Error("Page not found (404)");
     }
   } catch (error) {
     throw new Error(`Failed to fetch URL: ${error.message}`);
   }
   ```

3. **Job Marked as FAILED:**

   ```javascript
   // src/worker/processor.js
   await storageService.updateJob(job_id, {
     status: "FAILED",
     error: "Failed to fetch URL: Page not found (404)",
     updated_at: new Date().toISOString(),
   });
   ```

4. **User Gets Error:**

   ```bash
   GET /api/results/123

   {
     "job_id": "123",
     "status": "FAILED",
     "error": "Failed to fetch URL: Page not found (404)"
   }
   ```

**All Error Cases Handled:**

- **404 Not Found:** "Page not found (404)"
- **Timeout:** "Failed to fetch URL: timeout of 5000ms exceeded"
- **DNS Failure:** "Failed to fetch URL: getaddrinfo ENOTFOUND"
- **SSL Error:** "Failed to fetch URL: certificate has expired"
- **Connection Refused:** "Failed to fetch URL: connect ECONNREFUSED"

---

### Worker Crash Resiliency

**Scenario:** Worker process crashes mid-analysis

**Problem:** Job stuck in PROCESSING state forever

**Solution 1: Bull's Built-in Recovery**

Bull automatically handles crashes:

```javascript
// If worker crashes, Bull marks job as "stalled"
queue.on("stalled", (job) => {
  console.log(`Job ${job.id} stalled, will retry`);
});

// Job is automatically retried (up to 3 attempts)
const queue = new Queue("web-analysis", {
  defaultJobOptions: {
    attempts: 3, // Retry 3 times
    backoff: {
      type: "exponential", // 1s, 2s, 4s delays
      delay: 1000,
    },
  },
});
```

**Timeline:**

1. Worker starts processing job → status = PROCESSING
2. Worker crashes → Bull detects stalled job (after 30 seconds)
3. Bull moves job back to queue
4. Another worker picks it up → retry #1
5. If fails again → retry #2, retry #3
6. After 3 failures → job marked FAILED

---

### Redis Failure Handling

**Scenario:** Redis crashes or network partition

**Impact:**

- API can't create jobs → 503 Service Unavailable
- Worker can't process jobs → jobs paused
- Results can't be retrieved → 503 Service Unavailable

**Current Handling:**

```javascript
// src/api/controllers/analyse.controller.js
try {
  await storageService.createJob(job);
} catch (storageError) {
  logger.error("Failed to create job in storage", { error: storageError });

  return res.status(503).json({
    error: "Storage system is unavailable",
    message: "Failed to create job. Please try again.",
  });
}
```

**Improvements for Production:**

1. **Redis Sentinel (High Availability):**

   ```javascript
   const redis = new Redis({
     sentinels: [
       { host: "sentinel1", port: 26379 },
       { host: "sentinel2", port: 26379 },
       { host: "sentinel3", port: 26379 },
     ],
     name: "mymaster",
     sentinelRetryStrategy: (times) => Math.min(times * 50, 2000),
   });
   ```

   - **Benefit:** Automatic failover if master dies
   - **Downtime:** <5 seconds

2. **Redis Persistence:**

   ```
   # redis.conf
   appendonly yes                    # Enable AOF
   appendfsync everysec              # Flush every second
   save 900 1                        # Snapshot every 15 min
   ```

   - **Benefit:** Data survives crashes
   - **RPO:** <1 second data loss

3. **Circuit Breaker Pattern:**

   ```javascript
   const CircuitBreaker = require("opossum");

   const breaker = new CircuitBreaker(redisGet, {
     timeout: 3000, // Fail fast after 3s
     errorThresholdPercentage: 50,
     resetTimeout: 30000, // Try again after 30s
   });

   breaker.fallback(() => {
     // Return cached data or error
     return { error: "Service temporarily unavailable" };
   });
   ```

---

### Queue Failure Handling

**Scenario:** Bull queue becomes unavailable

**Current Handling:**

```javascript
// src/api/controllers/analyse.controller.js
try {
  await queueService.enqueue(job);
} catch (queueError) {
  logger.error("Failed to enqueue job", { error: queueError });

  // Mark job as FAILED in Redis
  await storageService.updateJob(job_id, {
    status: "FAILED",
    error: "Failed to queue job",
  });

  return res.status(503).json({
    error: "Queue system is down, please try again later",
  });
}
```

**Why This is Good:**

- Job is saved in Redis (not lost)
- User gets clear error message
- Can manually re-enqueue later via admin tool

**Future Enhancement - Dead Letter Queue:**

```javascript
// Jobs that fail 3 times go to DLQ for manual review
queue.on("failed", async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add({
      originalJob: job.data,
      error: error.message,
      failedAt: new Date(),
    });
  }
});
```

---

### Timeout Strategy

**Multiple Timeout Layers:**

1. **HTTP Fetch Timeout:** 5 seconds

   ```javascript
   axios.get(url, { timeout: 5000 });
   ```

2. **Job Timeout:** 5 seconds

   ```javascript
   queue.add(job, { timeout: 5000 });
   ```

3. **Request Timeout:** 30 seconds (Express)
   ```javascript
   server.setTimeout(30000);
   ```

**Why Multiple Layers?**

- Defense in depth
- Each layer catches different failure modes
- Prevents resource exhaustion

---

## 4. Testing Strategy

### Testing Philosophy

**Goal:** Maximize confidence while minimizing maintenance

### What We Chose to Test (and Why)

#### 1. API Controllers - **HIGH PRIORITY**

**Why?**

- Controllers are the entry point (highest risk)
- Most business logic lives here
- User-facing errors happen here

**What we test:**

```javascript
// ✅ Success scenarios
- Job creation returns 202 with valid job_id
- Numeric job ID generation (19 digits)
- Correct Redis storage
- Correct queue enqueueing

// ✅ Validation
- Invalid URLs rejected (400)
- SSRF protection (localhost, private IPs)
- Missing URL rejected

// ✅ Failure scenarios (CRITICAL)
- Redis unavailable → 503
- Queue unavailable → 503
- Job marked FAILED when queue fails

// ✅ Edge cases
- Empty strings
- Non-string URLs
- Objects/arrays instead of strings
```

**Why mocks?**

- Controllers should be tested in isolation
- Real Redis/Bull would be slow and flaky
- Mocks let us simulate failures easily

---

#### 2. URL Validator - **HIGH PRIORITY**

**Why?**

- Security-critical (SSRF protection)
- Complex regex logic (easy to get wrong)
- Edge cases are hard to catch manually

**What we test:**

```javascript
// ✅ Valid URLs
- HTTP/HTTPS protocols
- URLs with paths, query strings, fragments
- Internationalized domain names (IDN)
- URLs with ports

// ✅ Invalid URLs
- Missing protocol (example.com)
- File:// protocol
- Localhost (127.0.0.1, ::1)
- Private IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- AWS metadata endpoint (169.254.169.254)

// ✅ Edge cases
- Whitespace trimming
- Overly long URLs (>2048 chars)
- URLs with authentication credentials
- Punycode domain names
```

**Why so many tests?**

- Security bugs are expensive
- Regex is hard to reason about
- Each test documents expected behavior

---

#### 3. Job ID Generator - **MEDIUM PRIORITY**

**Why?**

- Uniqueness is critical (duplicate IDs = chaos)
- Timestamp encoding must be correct
- Concurrent requests could collide

**What we test:**

```javascript
// ✅ Uniqueness
- 1000 IDs in a loop are unique
- Concurrent generation (10 at once)
- Same-millisecond requests

// ✅ Format
- Always 19 digits
- Always numeric
- No leading zeros (except in sequence)

// ✅ Validation
- Valid IDs pass validation
- Invalid IDs fail validation
- Edge cases (too short, too long, non-numeric)
```

**Why test uniqueness so heavily?**

- Duplicate IDs would overwrite jobs in Redis
- Race conditions are hard to debug in production
- Tests run 1000x to catch rare collisions

---

#### 4. HTML Parser - **MEDIUM PRIORITY**

**Why?**

- Core business logic (what we're analyzing)
- Many edge cases (malformed HTML, special chars)
- Cheerio behavior needs validation

**What we test:**

```javascript
// ✅ HTML version detection
- HTML5, HTML 4.01, XHTML
- Missing DOCTYPE

// ✅ Title extraction
- Normal titles
- Missing <title>
- Titles with whitespace, line breaks, special chars

// ✅ Heading counts
- All levels (h1-h6)
- Nested headings
- Multiple headings of same level

// ✅ Link analysis
- Internal vs external links
- Relative URLs
- Anchor links (#)
- Different protocols

// ✅ Login form detection
- Forms with password fields
- Forms without password fields
- No forms

// ✅ Error handling
- Malformed HTML
- Extremely large HTML (stress test)
- Empty HTML
- Special characters
```

**Why test HTML parsing?**

- Cheerio is a third-party library (behavior changes)
- HTML in the wild is messy (not always valid)
- Edge cases cause silent failures

---

#### 5. Constants - **LOW PRIORITY**

**Why?**

- Prevent accidental changes to critical values
- Document expected constants

**What we test:**

```javascript
// ✅ HTTP status codes
- 200, 202, 400, 404, 500, 503

// ✅ Job statuses
- PENDING, PROCESSING, COMPLETED, FAILED

// ✅ Error messages
- All error message constants defined
```

**Why bother?**

- TypeScript would catch this, but we're using JavaScript
- Typos in constants cause hard-to-debug issues

---

### What We Didn't Test (and Why)

#### Services (Storage, Queue) - **PLANNED**

**Why not yet?**

- Require real Redis/Bull (integration tests)
- Unit tests with mocks would be low value
- Controllers already test service interactions

**Plan:**

```javascript
// Integration tests needed:
describe('Storage Service', () => {
  beforeAll(async () => {
    // Start real Redis container
    redis = await startRedisContainer();
  });

  test('should store and retrieve jobs', async () => {
    await storageService.createJob({ job_id: '123', ... });
    const job = await storageService.getJob('123');
    expect(job).toBeDefined();
  });
});
```

---

#### Worker Processor - **PLANNED**

**Why not yet?**

- Requires mocking fetcher and parser
- Integration test more valuable (full flow)

**Plan:**

```javascript
describe("Job Processor Integration", () => {
  test("should process job end-to-end", async () => {
    // Mock axios to return fake HTML
    nock("https://example.com").get("/").reply(200, "<html>...</html>");

    // Process job
    await processor({ job_id: "123", url: "https://example.com" });

    // Check Redis for results
    const job = await storageService.getJob("123");
    expect(job.status).toBe("COMPLETED");
    expect(job.results).toBeDefined();
  });
});
```

---

#### Error Handler Middleware - **LOW PRIORITY**

**Why not yet?**

- Simple pass-through logic
- Hard to test in isolation
- E2E tests will cover this

---

### Testing Decisions Explained

#### Why Jest?

**Alternatives:** Mocha, Ava, Tape

**Why Jest?**

- Built-in mocking (no extra libraries)
- Code coverage included
- Fast parallel execution
- Great error messages
- Snapshot testing (future use)

#### Why Mocks Instead of Real Services?

**Unit tests:**

- **Pros:** Fast (17 seconds for 133 tests), reliable, no dependencies
- **Cons:** Don't catch integration issues

**Integration tests:**

- **Pros:** Catch real issues, test actual behavior
- **Cons:** Slow (minutes), flaky, require Docker

## **Decision:** Unit tests first (70%), integration tests later (30%)

### What We'd Add With More Time

#### 1. Integration Tests (HIGH PRIORITY)

**Goal:** Test services with real Redis/Bull

```javascript
// tests/integration/job-flow.test.js
describe("Job Flow Integration", () => {
  let redis, queue;

  beforeAll(async () => {
    // Start Redis in Docker
    redis = await startRedis();
    queue = new Queue("test-queue", { redis });
  });

  test("should process job from creation to completion", async () => {
    // 1. Create job via API
    const response = await request(app)
      .post("/api/analyse")
      .send({ url: "https://example.com" });

    const { job_id } = response.body;

    // 2. Wait for worker to process
    await sleep(2000);

    // 3. Check results
    const results = await request(app).get(`/api/results/${job_id}`);

    expect(results.body.status).toBe("COMPLETED");
    expect(results.body.results.page_title).toBeDefined();
  });
});
```

---

#### 2. Load Testing (HIGH PRIORITY)

**Goal:** Find breaking point

**Tool:** k6 or Artillery

```javascript
// k6-load-test.js
import http from "k6/http";
import { check } from "k6";

export let options = {
  stages: [
    { duration: "1m", target: 100 }, // Ramp to 100 users
    { duration: "3m", target: 100 }, // Stay at 100
    { duration: "1m", target: 0 }, // Ramp down
  ],
};

export default function () {
  let res = http.post("http://localhost:3000/api/analyse", {
    url: "https://example.com",
  });

  check(res, {
    "status is 202": (r) => r.status === 202,
    "has job_id": (r) => r.json("job_id") !== undefined,
  });
}
```

**Expected results:**

- Find max throughput
- Identify memory leaks
- Test auto-scaling

---

#### 3. E2E Tests (MEDIUM PRIORITY)

**Goal:** Test real user workflows

**Tool:** Playwright or Cypress (if we add a UI)

```javascript
// tests/e2e/api-workflow.test.js
test("should analyze URL and return results", async () => {
  // Submit URL
  const submitRes = await fetch("http://localhost:3000/api/analyse", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com" }),
  });

  const { job_id } = await submitRes.json();

  // Poll for results
  let status = "PENDING";
  while (status === "PENDING" || status === "PROCESSING") {
    await sleep(1000);
    const res = await fetch(`http://localhost:3000/api/results/${job_id}`);
    const data = await res.json();
    status = data.status;
  }

  expect(status).toBe("COMPLETED");
});
```

---

## Summary

### Key Decisions

1. **Express + Bull + Redis**: Proven stack for async job processing
2. **SSRF Protection**: Security first for URL analysis
3. **Horizontal Scaling**: Add workers to handle more load
4. **Retry Logic**: 3 attempts with exponential backoff
5. **Testing Pyramid**: 75% unit, 20% integration, 5% E2E

### Next Steps

1. Add integration tests (Redis + Bull)
2. Set up Prometheus + Grafana monitoring
3. Deploy Redis Sentinel for HA
4. Configure NGINX load balancer
5. Run load tests to find limits
6. Set up PagerDuty alerts
7. Document API with OpenAPI/Swagger

---
