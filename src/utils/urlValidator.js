const Joi = require("joi");
const { URL } = require("url");
const dns = require("dns").promises;
const logger = require("./logger");

const urlSchema = Joi.string()
  .uri({ scheme: ["http", "https"] })
  .max(2048)
  .required();

function validateUrl(url) {
  const { error } = urlSchema.validate(url);
  return !error;
}

function checkSSRF(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Block localhost variations
    const localhostPatterns = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "0:0:0:0:0:0:0:1",
      "0000:0000:0000:0000:0000:0000:0000:0001",
    ];

    if (localhostPatterns.includes(hostname)) {
      logger.warn("SSRF attempt detected: localhost", { url: urlString });
      return true;
    }

    // Block private IP ranges (IPv4)
    const privateIPv4Ranges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^169\.254\./, // 169.254.0.0/16 (link-local)
      /^127\./, // 127.0.0.0/8 (loopback)
      /^0\./, // 0.0.0.0/8
      /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
    ];

    for (const range of privateIPv4Ranges) {
      if (range.test(hostname)) {
        logger.warn("SSRF attempt detected: private IP", {
          url: urlString,
          hostname,
        });
        return true;
      }
    }

    const metadataHosts = [
      "169.254.169.254", // AWS, GCP, Azure metadata
      "metadata.google.internal",
      "metadata.goog",
      "100.100.100.200", // Alibaba Cloud
    ];

    if (metadataHosts.includes(hostname)) {
      logger.warn("SSRF attempt detected: metadata service", {
        url: urlString,
        hostname,
      });
      return true;
    }

    // Block IPv6 private addresses
    if (hostname.includes(":")) {
      const ipv6PrivatePatterns = [
        /^fe80:/i, // Link-local
        /^fc00:/i, // Unique local
        /^fd00:/i, // Unique local
      ];

      for (const pattern of ipv6PrivatePatterns) {
        if (pattern.test(hostname)) {
          logger.warn("SSRF attempt detected: private IPv6", {
            url: urlString,
            hostname,
          });
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logger.warn("URL parsing error in SSRF check", {
      url: urlString,
      error: error.message,
    });
    return true;
  }
}

async function checkSSRFWithDNS(urlString) {
  try {
    if (checkSSRF(urlString)) {
      return true;
    }

    const url = new URL(urlString);
    const hostname = url.hostname;

    // Skip DNS check for IP addresses
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return false;
    }

    // Resolve hostname to IP addresses
    const addresses = await Promise.race([
      dns.resolve4(hostname),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DNS timeout")), 5000)
      ),
    ]);

    // Check if any resolved IP is private
    for (const ip of addresses) {
      const octets = ip.split(".").map(Number);

      // Check private ranges
      if (octets[0] === 10) return true;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
      if (octets[0] === 192 && octets[1] === 168) return true;
      if (octets[0] === 169 && octets[1] === 254) return true;
      if (octets[0] === 127) return true;
    }

    return false;
  } catch (error) {
    logger.debug("DNS resolution failed in SSRF check", {
      url: urlString,
      error: error.message,
    });
    return false;
  }
}

function validateUrlComplete(url, options = {}) {
  const result = {
    valid: false,
    error: null,
    details: null,
  };

  if (!url || typeof url !== "string") {
    result.error = "URL is required and must be a string";
    return result;
  }

  if (!validateUrl(url)) {
    result.error = "Invalid URL format";
    result.details = "URL must start with http:// or https:// and be valid";
    return result;
  }

  // Check for SSRF
  if (checkSSRF(url)) {
    result.error = "Invalid URL";
    result.details =
      "URLs pointing to private networks or metadata services are not allowed";
    return result;
  }

  if (url.length > 2048) {
    result.error = "URL too long";
    result.details = "URL must be less than 2048 characters";
    return result;
  }

  result.valid = true;
  return result;
}

module.exports = {
  validateUrl,
  checkSSRF,
  checkSSRFWithDNS,
  validateUrlComplete,
};
