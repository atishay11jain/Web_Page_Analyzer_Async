# Web Page Analyzer

A web service that analyzes web pages and extracts metadata such as HTML version, page title, headings, links, and login form detection. The service uses asynchronous job processing to handle analysis requests efficiently.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Running the Project](#running-the-project)
- [Using the API](#using-the-api)
- [Running Tests](#running-tests)
- [Stopping the Application](#stopping-the-application)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Web Page Analyzer is a RESTful API service that:

- Accepts URL analysis requests
- Queues jobs for asynchronous processing
- Fetches and parses HTML content
- Extracts structured metadata
- Returns analysis results via API

---

## Architecture

### High-Level Architecture

```
┌─────────────┐      HTTP       ┌──────────────┐
│   Client    │ ────────────────>│   API Server │
│ (curl/app)  │                  │  (Express.js)│
└─────────────┘                  └──────┬───────┘
                                        │
                                        │ Creates Job
                                        ▼
                                 ┌──────────────┐
                                 │    Redis     │
                                 │  (Storage &  │
                                 │    Queue)    │
                                 └──────┬───────┘
                                        │
                                        │ Job Queue
                                        ▼
                                 ┌──────────────┐
                                 │    Worker    │
                                 │  (Bull.js)   │
                                 └──────┬───────┘
                                        │
                                        │ Fetch & Parse
                                        ▼
                                 ┌──────────────┐
                                 │  Target URL  │
                                 │  (Web Page)  │
                                 └──────────────┘
```

### Components

1. **API Server** (Port 3000)

   - Accepts HTTP requests
   - Validates URLs (including SSRF protection)
   - Creates jobs in Redis
   - Enqueues jobs to Bull queue
   - Returns job status and results

2. **Redis** (Port 6379)

   - Stores job data (status, results, errors)
   - Manages Bull job queue
   - Acts as temporary database

3. **Worker Process**
   - Processes jobs from the queue
   - Fetches HTML content from target URLs
   - Parses HTML and extracts metadata
   - Updates job status in Redis
   - Retries failed jobs (up to 3 attempts)

### Job Lifecycle

```
Client Request → PENDING → PROCESSING → COMPLETED/FAILED
                    ↓           ↓              ↓
                  Redis      Worker         Results
```

---

## Prerequisites

Before you begin, ensure you have the following installed on your computer:

### Required Software

1. **Docker Desktop** (recommended for beginners)
   - Download: https://www.docker.com/products/docker-desktop
   - Includes both Docker and Docker Compose
   - Available for Windows, Mac, and Linux

### Verify Installation

Open a terminal/command prompt and run:

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker-compose --version
```

If both commands work, you're ready to proceed!

---

## Installation & Setup

### Step 1: Download the Project

```bash
# If you have Git installed
git clone <repository-url>
cd web_page_analyzer

# OR download and extract the ZIP file, then navigate to the folder
cd path/to/web_page_analyzer
```

### Step 2: Verify Project Structure

Make sure you have these files in your project directory:

```
web_page_analyzer/
├── docker-compose.yml       # Docker configuration
├── package.json             # Node.js dependencies
├── src/                     # Application source code
├── tests/                   # Test files
└── README.md               # This file
```

### Step 3: Configure Environment (Optional)

The project works with default settings, but you can customize by creating a `.env` file:

```bash
# Create .env file (optional)
NODE_ENV=production
PORT=3000
REDIS_HOST=redis
REDIS_PORT=6379
WORKER_CONCURRENCY=2
LOG_LEVEL=info
```

---

## Running the Project

### Option 1: Run Everything with Docker Compose (Recommended)

This is the easiest way to start the entire application:

```bash
# Build and start all services (API + Worker + Redis)
docker-compose up --build

```

**What happens:**

- ✅ Builds Docker images for API and Worker
- ✅ Starts Redis container
- ✅ Starts API server on port 3000
- ✅ Starts Worker process
- ✅ Sets up networking between containers

### Option 2: Run Individual Services

If you want more control, you can start services separately:

```bash
# Start Redis only
docker-compose up redis

# Start API server only (in another terminal)
docker-compose up api

# Start Worker only (in another terminal)
docker-compose up worker
```

### Verify Everything is Running

```bash
# Check running containers
docker-compose ps

# Expected output:
# NAME                              STATUS
# web_page_analyzer-api-1          Up
# web_page_analyzer-redis-1        Up
# web_page_analyzer-worker-1       Up
```

---

## Using the API

The API has two main endpoints:

### 1. Submit URL for Analysis

**Endpoint:** `POST /api/analyse`

**Request:**

```bash
curl -X POST http://localhost:3000/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**Response (202 Accepted):**

```json
{
  "job_id": "1234567890123456789",
  "status": "PENDING",
  "message": "Job queued successfully"
}
```

**Save the `job_id` to check results later!**

### 2. Get Analysis Results

**Endpoint:** `GET /api/results/:job_id`

**Request:**

```bash
# Replace JOB_ID with the actual job_id from step 1
curl http://localhost:3000/api/results/1234567890123456789
```

**Response (Job Completed):**

```json
{
  "job_id": "1234567890123456789",
  "status": "COMPLETED",
  "url": "https://example.com",
  "results": {
    "html_version": "HTML 5",
    "page_title": "Example Domain",
    "headings_count": {
      "h1": 1,
      "h2": 0,
      "h3": 0,
      "h4": 0,
      "h5": 0,
      "h6": 0
    },
    "internal_links_count": 0,
    "external_links_count": 1,
    "has_login_form": false
  }
}
```

**Response (Job Still Processing):**

```json
{
  "job_id": "1234567890123456789",
  "status": "PROCESSING",
  "url": "https://example.com"
}
```

**Response (Job Failed):**

```json
{
  "job_id": "1234567890123456789",
  "status": "FAILED",
  "url": "https://example.com",
  "error": "Failed to fetch URL: timeout"
}
```

### Complete Example Workflow

```bash
# 1. Submit a URL for analysis
curl -X POST http://localhost:3000/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com"}'

# Response: {"job_id": "1729799000000123456", ...}

# 2. Check status (wait a few seconds)
curl http://localhost:3000/api/results/1729799000000123456

# 3. Get final results
curl http://localhost:3000/api/results/1729799000000123456
```

### Error Cases

```bash
# Invalid URL (missing protocol)
curl -X POST http://localhost:3000/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"url": "example.com"}'
# Response: 400 Bad Request

# SSRF attempt (blocked)
curl -X POST http://localhost:3000/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:3000"}'
# Response: 400 Bad Request - "URLs pointing to private networks are not allowed"

# Missing URL field
curl -X POST http://localhost:3000/api/analyse \
  -H "Content-Type: application/json" \
  -d '{}'
# Response: 400 Bad Request - "URL is required"

# Invalid job ID
curl http://localhost:3000/api/results/invalid-id
# Response: 400 Bad Request - "Job ID must be a 19-digit numeric string"

# Non-existent job
curl http://localhost:3000/api/results/9999999999999999999
# Response: 404 Not Found - "No job found with ID: 9999999999999999999"
```

---

## Running Tests

The project unit tests covers controllers, utilities, and parsers.

### Option 1: Run Tests Inside Docker

```bash
# Build the test environment
docker-compose -f docker-compose.test.yml up --build

# Or run tests with npm (requires Node.js installed locally)
npm install
npm test
```

### Option 2: Run Specific Test Suites

```bash
# Run only controller tests
npm test -- tests/unit/api/controllers/

# Run only URL validator tests
npm test -- tests/unit/utils/urlValidator.test.js

# Run only parser tests
npm test -- tests/unit/worker/parser.test.js
```

### Test Categories

1. **API Controller Tests**

   - Job creation and validation
   - URL validation and SSRF protection
   - Redis failure scenarios
   - Queue failure scenarios
   - Error handling

2. **URL Validator Tests**

   - Valid/invalid URL formats
   - Private IP detection
   - Protocol validation
   - Security checks

3. **Job ID Generator Tests**

   - Uniqueness guarantees
   - Format validation
   - Concurrent generation
   - Timestamp encoding

4. **HTML Parser Tests**

   - HTML version detection
   - Title extraction
   - Heading counts
   - Link analysis
   - Login form detection

5. **Constants Tests**
   - HTTP status codes
   - Job statuses
   - Error messages

---

## Stopping the Application

### Stop All Services

```bash
# Stop containers (keeps data)
docker-compose down

# Stop and remove all data (Redis data will be lost)
docker-compose down -v

# Stop and remove images
docker-compose down --rmi all
```

### Stop Individual Services

```bash
# Stop only the worker
docker-compose stop worker

# Restart the worker
docker-compose restart worker
```

---

## Troubleshooting

### Problem: Port 3000 Already in Use

**Error:**

```
Error: bind: address already in use
```

**Solution:**

```bash
# Option 1: Stop the process using port 3000
# On Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# On Mac/Linux:
lsof -ti:3000 | xargs kill -9

# Option 2: Change the port in docker-compose.yml
# Edit docker-compose.yml and change "3000:3000" to "3001:3000"
```

### Problem: Docker Containers Won't Start

**Solution:**

```bash
# Clean up everything and start fresh
docker-compose down -v
docker system prune -f
docker-compose up --build
```

### Problem: Tests Failing

**Solution:**

```bash
# Clear Jest cache
npm test -- --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run tests again
npm test
```

### Problem: Worker Not Processing Jobs

**Check worker logs:**

```bash
# View worker logs
docker-compose logs worker

# Follow worker logs in real-time
docker-compose logs -f worker
```

**Common causes:**

- Redis not running: `docker-compose ps` (ensure Redis is Up)
- Network issues: `docker-compose restart worker`
- Job timeout: Increase timeout in `src/api/controllers/analyse.controller.js`

### Problem: "Cannot fetch URL" Errors

**Possible reasons:**

1. **Target website is down:** Try a different URL
2. **Network timeout:** Target site is slow to respond
3. **SSRF protection:** You're trying to analyze localhost or private IPs

**Verify:**

```bash
# Test if URL is accessible
curl -I https://example.com

# Check worker logs for detailed errors
docker-compose logs worker
```

### Problem: High Memory Usage

**Solution:**

```bash
# Reduce worker concurrency in docker-compose.yml
environment:
  - WORKER_CONCURRENCY=1  # Change from 2 to 1

# Restart services
docker-compose restart worker
```

---

## Development

### Project Structure

```
web_page_analyzer/
├── src/
│   ├── api/
│   │   ├── controllers/      # Request handlers
│   │   │   ├── analyse.controller.js
│   │   │   └── results.controller.js
│   │   ├── middleware/       # Express middleware
│   │   │   └── errorHandler.js
│   │   └── routes/           # API routes
│   │       ├── analyse.route.js
│   │       └── results.route.js
│   ├── services/
│   │   ├── queue.service.js     # Bull queue management
│   │   ├── storage.service.js   # Redis data storage
│   │   └── cleanup.service.js   # Job cleanup
│   ├── worker/
│   │   ├── worker.js            # Worker entry point
│   │   ├── processor.js         # Job processor
│   │   ├── fetcher.js          # HTTP fetcher
│   │   └── parser.js           # HTML parser
│   ├── utils/
│   │   ├── constants.js        # Application constants
│   │   ├── logger.js           # Winston logger
│   │   ├── urlValidator.js     # URL validation + SSRF
│   │   └── jobIdGenerator.js   # Unique ID generator
│   ├── app.js                  # Express app setup
│   └── server.js               # Server entry point
├── tests/
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests (TBD)
│   └── setup.js               # Test configuration
├── docker/
│   ├── Dockerfile.api         # API server image
│   └── Dockerfile.worker      # Worker image
├── docker-compose.yml         # Multi-container setup
├── package.json               # Dependencies
├── jest.config.js            # Test configuration
├── README.md                 # This file
└── DECISIONS.md             # Architecture decisions
```

---

## Environment Variables

| Variable             | Default      | Description                                    |
| -------------------- | ------------ | ---------------------------------------------- |
| `NODE_ENV`           | `production` | Node environment (production/development/test) |
| `PORT`               | `3000`       | API server port                                |
| `REDIS_HOST`         | `redis`      | Redis hostname                                 |
| `REDIS_PORT`         | `6379`       | Redis port                                     |
| `WORKER_CONCURRENCY` | `2`          | Number of concurrent jobs per worker           |
| `LOG_LEVEL`          | `info`       | Logging level (error/warn/info/debug)          |

---

## License

This project is provided as-is for educational and evaluation purposes.

---

**Ready to analyze some web pages? Start with:**

```bash
docker-compose up --build -d
curl -X POST http://localhost:3000/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Happy analyzing! 🚀
