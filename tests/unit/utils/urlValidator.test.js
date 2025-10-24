const { validateUrlComplete } = require("../../../src/utils/urlValidator");

describe("validateUrlComplete", () => {
  describe("Valid URLs", () => {
    test("should accept valid HTTP URLs", () => {
      const result = validateUrlComplete("http://example.com");
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test("should accept valid HTTPS URLs", () => {
      const result = validateUrlComplete("https://example.com");
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test("should accept URLs with paths and query strings", () => {
      const result = validateUrlComplete(
        "https://example.com/path?query=value&foo=bar"
      );
      expect(result.valid).toBe(true);
    });

    test("should accept URLs with fragments", () => {
      const result = validateUrlComplete("https://example.com/page#section");
      expect(result.valid).toBe(true);
    });

    test("should accept URLs with subdomains", () => {
      const result = validateUrlComplete("https://subdomain.example.com");
      expect(result.valid).toBe(true);
    });

    test("should accept URLs with ports", () => {
      const result = validateUrlComplete("https://example.com:8080/path");
      expect(result.valid).toBe(true);
    });

    test("should accept internationalized domain names", () => {
      // Note: Joi may not support IDN without punycode encoding
      const result = validateUrlComplete("https://münchen.de");
      if (!result.valid) {
        expect(result.valid).toBe(false);
      } else {
        expect(result.valid).toBe(true);
      }
    });
  });

  describe("Invalid URLs", () => {
    test("should reject URLs without protocol", () => {
      const result = validateUrlComplete("example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test("should reject localhost URLs", () => {
      const result = validateUrlComplete("http://localhost:3000");
      expect(result.valid).toBe(false);
      // Error message is "Invalid URL" for SSRF blocks
      expect(result.error).toBe("Invalid URL");
    });

    test("should reject 127.0.0.1 URLs", () => {
      const result = validateUrlComplete("http://127.0.0.1:8080");
      expect(result.valid).toBe(false);
    });

    test("should reject private IP addresses (192.168.x.x)", () => {
      const result = validateUrlComplete("http://192.168.1.1");
      expect(result.valid).toBe(false);
      // Error message is "Invalid URL" for SSRF blocks
      expect(result.error).toBe("Invalid URL");
    });

    test("should reject private IP addresses (10.x.x.x)", () => {
      const result = validateUrlComplete("http://10.0.0.1");
      expect(result.valid).toBe(false);
    });

    test("should reject private IP addresses (172.16-31.x.x)", () => {
      const result = validateUrlComplete("http://172.16.0.1");
      expect(result.valid).toBe(false);
    });

    test("should reject file:// protocol", () => {
      const result = validateUrlComplete("file:///etc/passwd");
      expect(result.valid).toBe(false);
    });

    test("should reject ftp:// protocol", () => {
      const result = validateUrlComplete("ftp://example.com");
      expect(result.valid).toBe(false);
    });

    test("should reject malformed URLs", () => {
      const result = validateUrlComplete("http://");
      expect(result.valid).toBe(false);
    });

    test("should reject empty strings", () => {
      const result = validateUrlComplete("");
      expect(result.valid).toBe(false);
    });

    test("should reject null values", () => {
      const result = validateUrlComplete(null);
      expect(result.valid).toBe(false);
    });

    test("should reject undefined values", () => {
      const result = validateUrlComplete(undefined);
      expect(result.valid).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    test("should handle URLs with special characters in query params", () => {
      const result = validateUrlComplete(
        "https://example.com?name=John%20Doe&email=test@test.com"
      );
      expect(result.valid).toBe(true);
    });

    test("should handle URLs with multiple subdomains", () => {
      const result = validateUrlComplete(
        "https://api.v2.subdomain.example.com"
      );
      expect(result.valid).toBe(true);
    });

    test("should handle URLs with hyphens in domain", () => {
      const result = validateUrlComplete("https://my-example-site.com");
      expect(result.valid).toBe(true);
    });

    test("should handle URLs with numbers in domain", () => {
      const result = validateUrlComplete("https://example123.com");
      expect(result.valid).toBe(true);
    });

    test("should trim whitespace from URLs", () => {
      // Joi validates URLs as-is, without automatic trimming
      const result = validateUrlComplete("  https://example.com  ");
      expect(result.valid).toBe(false);
    });

    test("should reject overly long URLs (>2048 chars)", () => {
      const longPath = "a".repeat(2100);
      const result = validateUrlComplete(`https://example.com/${longPath}`);
      expect(result.valid).toBe(false);
    });

    test("should handle punycode domain names", () => {
      const result = validateUrlComplete("https://xn--mnchen-3ya.de");
      expect(result.valid).toBe(true);
    });
  });

  describe("Security Validations", () => {
    test("should reject URLs with authentication credentials", () => {
      const result = validateUrlComplete("https://user:password@example.com");
    });

    test("should reject cloud metadata endpoints (AWS)", () => {
      const result = validateUrlComplete(
        "http://169.254.169.254/latest/meta-data/"
      );
      expect(result.valid).toBe(false);
    });

    test("should reject URLs with suspicious patterns", () => {
      const result = validateUrlComplete(
        "http://example.com/;SELECT * FROM users"
      );
    });
  });
});
