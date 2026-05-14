import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJobFromUrl, stripHtml } from "../fetchJobFromUrl";

/**
 * Tests for the job-URL resolver. We stub `global.fetch` so the test
 * doesn't hit the network. Each test sets the response shape it expects
 * for its target host.
 */

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

function mockJson(body: unknown, init: { status?: number } = {}) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  }));
}
function mockHtml(html: string, init: { status?: number } = {}) {
  return Promise.resolve(new Response(html, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html" },
  }));
}

describe("fetchJobFromUrl — Greenhouse", () => {
  it("hits the boards-api.greenhouse.io endpoint and returns clean text", async () => {
    globalThis.fetch = vi.fn((url) => {
      expect(String(url)).toBe("https://boards-api.greenhouse.io/v1/boards/stripe/jobs/12345");
      return mockJson({
        title:        "Senior Engineer",
        company_name: "Stripe",
        location:     { name: "Remote — US" },
        content:      "<p>Build payment infrastructure.</p><ul><li>Strong Go</li><li>Experience with Postgres</li></ul>",
      });
    }) as unknown as typeof fetch;

    const r = await fetchJobFromUrl("https://boards.greenhouse.io/stripe/jobs/12345");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("greenhouse");
    expect(r.title).toBe("Senior Engineer");
    expect(r.company).toBe("Stripe");
    expect(r.location).toBe("Remote — US");
    expect(r.description).toContain("Build payment infrastructure");
    expect(r.description).toContain("Strong Go");
    expect(r.description).not.toContain("<p>");
  });

  it("handles job-boards.greenhouse.io variant", async () => {
    globalThis.fetch = vi.fn(() => mockJson({
      title: "PM", company_name: "Acme", content: "<p>" + "x".repeat(200) + "</p>",
    })) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://job-boards.greenhouse.io/acme/jobs/999");
    expect(r.ok).toBe(true);
  });

  it("returns error on Greenhouse API 404", async () => {
    globalThis.fetch = vi.fn(() => mockJson({}, { status: 404 })) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://boards.greenhouse.io/stripe/jobs/99999");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/HTTP 404|usable job description/);
  });
});

describe("fetchJobFromUrl — Lever", () => {
  it("hits api.lever.co and concatenates description + lists + additional", async () => {
    globalThis.fetch = vi.fn((url) => {
      expect(String(url)).toBe("https://api.lever.co/v0/postings/datadog/abc-123-def?mode=json");
      return mockJson({
        title: "Frontend Engineer",
        descriptionPlain: "We're hiring a frontend engineer to build dashboards.",
        lists: [
          { text: "Requirements", content: "<li>5+ years React</li>" },
          { text: "Nice to have",  content: "<li>TypeScript</li>" },
        ],
        additionalPlain: "Remote-friendly culture.",
        categories: { location: "New York" },
      });
    }) as unknown as typeof fetch;

    const r = await fetchJobFromUrl("https://jobs.lever.co/datadog/abc-123-def");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("lever");
    expect(r.title).toBe("Frontend Engineer");
    expect(r.location).toBe("New York");
    expect(r.description).toContain("frontend engineer to build dashboards");
    expect(r.description).toContain("## Requirements");
    expect(r.description).toContain("5+ years React");
    expect(r.description).toContain("Remote-friendly culture");
  });
});

describe("fetchJobFromUrl — Generic HTML fallback", () => {
  it("strips HTML, extracts the title, and returns the visible text", async () => {
    globalThis.fetch = vi.fn(() => mockHtml(`
      <html>
        <head><title>Backend Engineer | Foo Co</title></head>
        <body>
          <script>console.log('ignored')</script>
          <style>.x{color:red}</style>
          <h1>Backend Engineer</h1>
          <p>We are looking for someone to ${"x".repeat(120)} build backend services.</p>
          <p>You will collaborate with the team and ship code.</p>
        </body>
      </html>
    `)) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://example.com/careers/backend-engineer");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("html");
    expect(r.title).toBe("Backend Engineer");
    expect(r.description).toContain("Backend Engineer");
    expect(r.description).toContain("build backend services");
    expect(r.description).not.toContain("<");
    expect(r.description).not.toContain("console.log");
    expect(r.description).not.toContain(".x{color:red}");
  });

  it("rejects HTML that returns fewer than 80 chars of usable text", async () => {
    globalThis.fetch = vi.fn(() => mockHtml("<html><body><p>Nope</p></body></html>")) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://example.com/empty");
    expect(r.ok).toBe(false);
  });
});

describe("fetchJobFromUrl — bad inputs", () => {
  it("rejects an invalid URL", async () => {
    const r = await fetchJobFromUrl("not a url");
    expect(r.ok).toBe(false);
  });

  it("rejects non-http(s) schemes", async () => {
    const r = await fetchJobFromUrl("ftp://example.com/job");
    expect(r.ok).toBe(false);
  });
});

describe("stripHtml", () => {
  it("removes script + style blocks", () => {
    const html = `<div>keep<script>alert(1)</script>this<style>p{}</style></div>`;
    expect(stripHtml(html)).toBe("keep this");
  });

  it("turns block elements into newlines", () => {
    const html = "<h1>A</h1><p>B</p><p>C</p>";
    const out = stripHtml(html);
    expect(out.split("\n").map(s => s.trim()).filter(Boolean)).toEqual(["A", "B", "C"]);
  });

  it("decodes core entities", () => {
    expect(stripHtml("<p>A &amp; B &lt; C &gt; D &nbsp;E &#39;F&#39;</p>"))
      .toBe("A & B < C > D  E 'F'");
  });
});
