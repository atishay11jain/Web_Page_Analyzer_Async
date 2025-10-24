const cheerio = require("cheerio");
const { URL } = require("url");
const logger = require("../utils/logger");

function parseHtml(html, baseUrl) {
  try {
    const $ = cheerio.load(html, {
      decodeEntities: false,
      normalizeWhitespace: true,
      xmlMode: false,
    });

    const results = {
      html_version: extractHtmlVersion(html),
      page_title: extractTitle($),
      headings_count: countHeadings($),
      internal_links_count: countLinks($, baseUrl, "internal"),
      external_links_count: countLinks($, baseUrl, "external"),
      has_login_form: hasLoginForm($),
    };

    logger.debug("HTML parsed successfully", {
      url: baseUrl,
      title: results.page_title,
      htmlVersion: results.html_version,
    });

    return results;
  } catch (error) {
    logger.error("HTML parsing failed", {
      url: baseUrl,
      error: error.message,
    });

    // Return partial results on error
    return {
      html_version: "Unknown",
      page_title: "Parse Error",
      headings_count: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      internal_links_count: 0,
      external_links_count: 0,
      has_login_form: false,
      parse_error: error.message,
    };
  }
}

function extractHtmlVersion(html) {
  try {
    const doctypeMatch = html.match(/<!DOCTYPE\s+([^>]+)>/i);

    if (!doctypeMatch) {
      return "Unknown (No DOCTYPE)";
    }

    const doctype = doctypeMatch[1].trim().toLowerCase();

    // HTML5
    if (doctype === "html") {
      return "HTML 5";
    }

    // HTML 4.01
    if (doctype.includes("html 4.01")) {
      if (doctype.includes("strict")) return "HTML 4.01 Strict";
      if (doctype.includes("transitional")) return "HTML 4.01 Transitional";
      if (doctype.includes("frameset")) return "HTML 4.01 Frameset";
      return "HTML 4.01";
    }

    // XHTML
    if (doctype.includes("xhtml")) {
      if (doctype.includes("1.0 strict")) return "XHTML 1.0 Strict";
      if (doctype.includes("1.0 transitional")) return "XHTML 1.0 Transitional";
      if (doctype.includes("1.0 frameset")) return "XHTML 1.0 Frameset";
      if (doctype.includes("1.1")) return "XHTML 1.1";
      return "XHTML";
    }

    // HTML 3.2
    if (doctype.includes("html 3.2")) {
      return "HTML 3.2";
    }

    // HTML 2.0
    if (doctype.includes("html 2.0") || doctype.includes("html level 2")) {
      return "HTML 2.0";
    }

    return `Unknown (${doctype.substring(0, 50)})`;
  } catch (error) {
    logger.warn("Failed to extract HTML version", { error: error.message });
    return "Unknown (Parse Error)";
  }
}

function extractTitle($) {
  try {
    const title = $("title").first().text().trim();
    if (title) {
      return title.substring(0, 200);
    }

    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) {
      return ogTitle.trim().substring(0, 200);
    }

    const twitterTitle = $('meta[name="twitter:title"]').attr("content");
    if (twitterTitle) {
      return twitterTitle.trim().substring(0, 200);
    }

    const h1 = $("h1").first().text().trim();
    if (h1) {
      return h1.substring(0, 200);
    }

    return "No title found";
  } catch (error) {
    logger.warn("Failed to extract title", { error: error.message });
    return "Error extracting title";
  }
}

function countHeadings($) {
  try {
    return {
      h1: $("h1").length,
      h2: $("h2").length,
      h3: $("h3").length,
      h4: $("h4").length,
      h5: $("h5").length,
      h6: $("h6").length,
    };
  } catch (error) {
    logger.warn("Failed to count headings", { error: error.message });
    return { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  }
}

function countLinks($, baseUrl, type) {
  try {
    const baseUrlObj = new URL(baseUrl);
    const baseDomain = baseUrlObj.hostname.toLowerCase();
    let count = 0;

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");

      // Skip invalid or special hrefs
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("data:")
      ) {
        return;
      }

      try {
        const absoluteUrl = new URL(href, baseUrl);
        const linkDomain = absoluteUrl.hostname.toLowerCase();

        const normalizedBase = baseDomain.replace(/^www\./, "");
        const normalizedLink = linkDomain.replace(/^www\./, "");

        const isInternal = normalizedBase === normalizedLink;

        if (type === "internal" && isInternal) {
          count++;
        } else if (type === "external" && !isInternal) {
          count++;
        }
      } catch (urlError) {
        logger.debug("Invalid link URL", { href, error: urlError.message });
      }
    });

    return count;
  } catch (error) {
    logger.warn("Failed to count links", {
      type,
      baseUrl,
      error: error.message,
    });
    return 0;
  }
}

function hasLoginForm($) {
  try {
    const passwordInputs = $('input[type="password"]').length;
    if (passwordInputs > 0) {
      return true;
    }

    const passwordRelatedInputs = $(
      'input[name*="password"], input[id*="password"], input[name*="passwd"], input[id*="passwd"]'
    ).length;
    if (passwordRelatedInputs > 0) {
      return true;
    }

    return false;
  } catch (error) {
    logger.warn("Failed to check for login form", { error: error.message });
    return false;
  }
}

function validateResults(results) {
  try {
    const requiredFields = [
      "html_version",
      "page_title",
      "headings_count",
      "internal_links_count",
      "external_links_count",
      "has_login_form",
    ];

    for (const field of requiredFields) {
      if (!(field in results)) {
        logger.error("Missing required field in results", { field });
        return false;
      }
    }

    // Validate headings_count structure
    const headingLevels = ["h1", "h2", "h3", "h4", "h5", "h6"];
    for (const level of headingLevels) {
      if (typeof results.headings_count[level] !== "number") {
        logger.error("Invalid headings_count structure", { level });
        return false;
      }
    }

    // Validate types
    if (typeof results.internal_links_count !== "number") return false;
    if (typeof results.external_links_count !== "number") return false;
    if (typeof results.has_login_form !== "boolean") return false;

    return true;
  } catch (error) {
    logger.error("Results validation failed", { error: error.message });
    return false;
  }
}

module.exports = {
  parseHtml,
  extractHtmlVersion,
  extractTitle,
  countHeadings,
  countLinks,
  hasLoginForm,
  validateResults,
};
