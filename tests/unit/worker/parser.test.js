const { parseHtml, validateResults } = require('../../../src/worker/parser');

describe('parseHtml', () => {
  describe('HTML Version Detection', () => {
    test('should detect HTML5 (<!DOCTYPE html>)', () => {
      const html = '<!DOCTYPE html><html><head><title>Test</title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.html_version).toBe('HTML 5');
    });

    test('should detect HTML 4.01 Strict', () => {
      const html = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd"><html></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.html_version).toContain('HTML 4.01');
    });

    test('should detect HTML 4.01 Transitional', () => {
      const html = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><html></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.html_version).toContain('Transitional');
    });

    test('should detect XHTML 1.0', () => {
      const html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"><html></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.html_version).toContain('XHTML');
    });

    test('should handle missing DOCTYPE', () => {
      const html = '<html><head><title>Test</title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.html_version).toContain('Unknown');
    });
  });

  describe('Title Extraction', () => {
    test('should extract page title correctly', () => {
      const html = '<!DOCTYPE html><html><head><title>My Page Title</title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.page_title).toBe('My Page Title');
    });

    test('should handle pages without <title> tag', () => {
      const html = '<!DOCTYPE html><html><head></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      // Parser returns "No title found" when no title exists
      expect(result.page_title).toBe('No title found');
    });

    test('should trim whitespace from titles', () => {
      const html = '<!DOCTYPE html><html><head><title>  Spaced Title  </title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.page_title).toBe('Spaced Title');
    });

    test('should handle titles with special characters', () => {
      const html = '<!DOCTYPE html><html><head><title>Special & "Chars" \'Title\'</title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.page_title).toContain('Special');
    });

    test('should handle empty <title> tags', () => {
      const html = '<!DOCTYPE html><html><head><title></title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      // Parser returns "No title found" for empty title tags
      expect(result.page_title).toBe('No title found');
    });

    test('should handle titles with line breaks', () => {
      const html = '<!DOCTYPE html><html><head><title>Multi\nLine\nTitle</title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');
      expect(result.page_title).toBeTruthy();
    });
  });

  describe('Heading Count', () => {
    test('should count all heading levels (h1-h6) correctly', () => {
      const html = `<!DOCTYPE html><html><body>
        <h1>Heading 1</h1>
        <h2>Heading 2</h2>
        <h2>Another H2</h2>
        <h3>Heading 3</h3>
        <h4>Heading 4</h4>
        <h5>Heading 5</h5>
        <h6>Heading 6</h6>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.headings_count.h1).toBe(1);
      expect(result.headings_count.h2).toBe(2);
      expect(result.headings_count.h3).toBe(1);
      expect(result.headings_count.h4).toBe(1);
      expect(result.headings_count.h5).toBe(1);
      expect(result.headings_count.h6).toBe(1);
    });

    test('should return zero counts when no headings exist', () => {
      const html = '<!DOCTYPE html><html><body><p>No headings here</p></body></html>';
      const result = parseHtml(html, 'https://example.com');

      expect(result.headings_count.h1).toBe(0);
      expect(result.headings_count.h2).toBe(0);
      expect(result.headings_count.h3).toBe(0);
      expect(result.headings_count.h4).toBe(0);
      expect(result.headings_count.h5).toBe(0);
      expect(result.headings_count.h6).toBe(0);
    });

    test('should count headings inside nested elements', () => {
      const html = `<!DOCTYPE html><html><body>
        <div><h1>Nested H1</h1></div>
        <section><article><h2>Deep H2</h2></article></section>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.headings_count.h1).toBe(1);
      expect(result.headings_count.h2).toBe(1);
    });

    test('should count multiple headings of same level', () => {
      const html = `<!DOCTYPE html><html><body>
        <h2>First</h2><h2>Second</h2><h2>Third</h2>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.headings_count.h2).toBe(3);
    });
  });

  describe('Link Analysis', () => {
    test('should count internal links correctly', () => {
      const html = `<!DOCTYPE html><html><body>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="https://example.com/page">Page</a>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.internal_links_count).toBeGreaterThanOrEqual(2);
    });

    test('should count external links correctly', () => {
      const html = `<!DOCTYPE html><html><body>
        <a href="https://google.com">Google</a>
        <a href="https://github.com">GitHub</a>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.external_links_count).toBe(2);
    });

    test('should differentiate between internal and external links', () => {
      const html = `<!DOCTYPE html><html><body>
        <a href="/internal">Internal</a>
        <a href="https://external.com">External</a>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.internal_links_count).toBeGreaterThan(0);
      expect(result.external_links_count).toBeGreaterThan(0);
    });

    test('should handle relative URLs as internal', () => {
      const html = `<!DOCTYPE html><html><body>
        <a href="./page">Relative</a>
        <a href="../parent">Parent</a>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.internal_links_count).toBeGreaterThan(0);
    });

    test('should skip anchor links (#) in counting', () => {
      const html = `<!DOCTYPE html><html><body>
        <a href="#section1">Section 1</a>
        <a href="#section2">Section 2</a>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      // Anchor links are explicitly skipped, so count should be 0
      expect(result.internal_links_count).toBe(0);
    });

    test('should handle links with different protocols', () => {
      const html = `<!DOCTYPE html><html><body>
        <a href="http://example.com/page">HTTP</a>
        <a href="https://example.com/page">HTTPS</a>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.internal_links_count).toBeGreaterThan(0);
    });

    test('should handle pages with no links', () => {
      const html = '<!DOCTYPE html><html><body><p>No links</p></body></html>';
      const result = parseHtml(html, 'https://example.com');

      expect(result.internal_links_count).toBe(0);
      expect(result.external_links_count).toBe(0);
    });
  });

  describe('Login Form Detection', () => {
    test('should detect forms with password fields', () => {
      const html = `<!DOCTYPE html><html><body>
        <form>
          <input type="text" name="username">
          <input type="password" name="password">
        </form>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.has_login_form).toBe(true);
    });

    test('should return false when no forms exist', () => {
      const html = '<!DOCTYPE html><html><body><p>No forms</p></body></html>';
      const result = parseHtml(html, 'https://example.com');

      expect(result.has_login_form).toBe(false);
    });

    test('should detect forms with type="password"', () => {
      const html = `<!DOCTYPE html><html><body>
        <form><input type="password"></form>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.has_login_form).toBe(true);
    });

    test('should return false for forms without password fields', () => {
      const html = `<!DOCTYPE html><html><body>
        <form>
          <input type="text" name="search">
          <input type="submit">
        </form>
      </body></html>`;
      const result = parseHtml(html, 'https://example.com');

      expect(result.has_login_form).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed HTML gracefully', () => {
      const html = '<html><body><div><p>Unclosed tags';
      const result = parseHtml(html, 'https://example.com');

      expect(result).toHaveProperty('html_version');
      expect(result).toHaveProperty('page_title');
    });

    test('should handle extremely large HTML', () => {
      const largeHtml = '<!DOCTYPE html><html><body>' + 'A'.repeat(1000000) + '</body></html>';
      const result = parseHtml(largeHtml, 'https://example.com');

      expect(result).toBeDefined();
    });

    test('should handle empty HTML', () => {
      const result = parseHtml('', 'https://example.com');

      expect(result).toBeDefined();
      expect(result.headings_count.h1).toBe(0);
    });

    test('should handle HTML with special characters', () => {
      const html = '<!DOCTYPE html><html><body><p>Special: © ® ™ € £</p></body></html>';
      const result = parseHtml(html, 'https://example.com');

      expect(result).toBeDefined();
    });

    test('should return partial results on parse errors', () => {
      const badHtml = '<<<invalid>>>html<<<';
      const result = parseHtml(badHtml, 'https://example.com');

      expect(result).toHaveProperty('html_version');
      expect(result).toHaveProperty('page_title');
      expect(result).toHaveProperty('headings_count');
    });
  });

  describe('Result Structure', () => {
    test('should return all required fields', () => {
      const html = '<!DOCTYPE html><html><head><title>Test</title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');

      expect(result).toHaveProperty('html_version');
      expect(result).toHaveProperty('page_title');
      expect(result).toHaveProperty('headings_count');
      expect(result).toHaveProperty('internal_links_count');
      expect(result).toHaveProperty('external_links_count');
      expect(result).toHaveProperty('has_login_form');
    });

    test('should have correct data types', () => {
      const html = '<!DOCTYPE html><html><head><title>Test</title></head><body></body></html>';
      const result = parseHtml(html, 'https://example.com');

      expect(typeof result.html_version).toBe('string');
      expect(typeof result.page_title).toBe('string');
      expect(typeof result.headings_count).toBe('object');
      expect(typeof result.internal_links_count).toBe('number');
      expect(typeof result.external_links_count).toBe('number');
      expect(typeof result.has_login_form).toBe('boolean');
    });
  });
});

describe('validateResults', () => {
  test('should validate correct result structure', () => {
    const validResults = {
      html_version: 'HTML 5',
      page_title: 'Test Page',
      headings_count: { h1: 1, h2: 2, h3: 0, h4: 0, h5: 0, h6: 0 },
      internal_links_count: 5,
      external_links_count: 3,
      has_login_form: false,
    };

    expect(validateResults(validResults)).toBe(true);
  });

  test('should reject results missing required fields', () => {
    const invalidResults = {
      html_version: 'HTML 5',
      page_title: 'Test Page',
      // Missing other fields
    };

    expect(validateResults(invalidResults)).toBe(false);
  });

  test('should reject results with wrong data types', () => {
    const invalidResults = {
      html_version: 'HTML 5',
      page_title: 'Test Page',
      headings_count: 'not an object',
      internal_links_count: 5,
      external_links_count: 3,
      has_login_form: false,
    };

    expect(validateResults(invalidResults)).toBe(false);
  });

  test('should reject null or undefined', () => {
    expect(validateResults(null)).toBe(false);
    expect(validateResults(undefined)).toBe(false);
  });
});
