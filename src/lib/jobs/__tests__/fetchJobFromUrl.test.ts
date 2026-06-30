import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJobFromUrl, stripHtml } from "../fetchJobFromUrl";

/**
 * Tests for the job-URL resolver. We stub `global.fetch` so the test
 * doesn't hit the network. Each test sets the response shape it expects
 * for its target host.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
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
        content:      "<p>Build payment infrastructure that scales to handle billions of transactions per year.</p><ul><li>Strong Go and TypeScript experience required</li><li>Experience with Postgres, Redis, and distributed systems</li></ul>",
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

  it("returns 'no longer listed' on Greenhouse API 404 (updated 2026-06-27 per Fix 4)", async () => {
    globalThis.fetch = vi.fn(() => mockJson({}, { status: 404 })) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://boards.greenhouse.io/stripe/jobs/99999");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Fix 4: ATS 404s now translate to a user-friendly "no longer listed"
    // message instead of the raw "HTTP 404" string.
    expect(r.error).toMatch(/no longer listed/i);
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
          <p>Responsibilities include building distributed systems and mentoring engineers.</p>
          <p>You will collaborate with the team and ship code.</p>
          <p>Requirements: 5+ years of experience in Go, Rust, or TypeScript. Strong communication skills.</p>
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
    // Whitespace runs are collapsed to a single space (intentional — keeps
    // LLM context tidy), so the &nbsp; between D and E becomes one space.
    expect(stripHtml("<p>A &amp; B &lt; C &gt; D &nbsp;E &#39;F&#39;</p>"))
      .toBe("A & B < C > D E 'F'");
  });
});

describe("fetchJobFromUrl — Generic HTML JSON-LD JobPosting (2026-06-28)", () => {
  it("extracts the description from JSON-LD JobPosting", async () => {
    const ld = {
      "@context": "https://schema.org",
      "@type":    "JobPosting",
      title:      "Business Information Security Officer",
      hiringOrganization: { name: "RBC" },
      jobLocation: { address: { addressLocality: "Jersey City", addressRegion: "NJ", addressCountry: "USA" } },
      description: "<p>You will own the security strategy for our global operations. Responsibilities include leading risk assessments, partnering with engineering on threat modeling, and reporting to the CISO. We are looking for someone with 8+ years of experience in information security, deep expertise in cloud security, and demonstrated leadership of cross-functional initiatives. Strong communication skills required.</p>",
    };
    globalThis.fetch = vi.fn(() => mockHtml(`
      <html><head><title>BISO | RBC</title></head>
      <body><script type="application/ld+json">${JSON.stringify(ld)}</script>
      <p>cookie policy nav junk</p></body></html>
    `)) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://jobs.rbc.com/ca/en/job/123/BISO");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("html");
    expect(r.title).toBe("Business Information Security Officer");
    expect(r.company).toBe("RBC");
    expect(r.location).toContain("Jersey City");
    expect(r.description).toContain("security strategy");
    expect(r.description).toContain("8+ years of experience");
    // Cookie/nav junk from outside the JSON-LD must NOT leak in
    expect(r.description).not.toContain("cookie policy");
  });

  it("handles JSON-LD wrapped in @graph", async () => {
    const ld = { "@context": "https://schema.org", "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [] },
      { "@type": "JobPosting", title: "Engineer", description: "Build cool things. " + "x".repeat(220) + ". You will collaborate with the team and have strong experience in this area." },
    ]};
    globalThis.fetch = vi.fn(() => mockHtml(`<html><body><script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`)) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://example.com/job/1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.description).toContain("Build cool things");
  });
});

describe("fetchJobFromUrl — Generic HTML container patterns (2026-06-28)", () => {
  it("extracts text from a job-description div container", async () => {
    const inside = "We are looking for a senior backend engineer to lead our distributed systems work. Responsibilities include building distributed systems, mentoring the team, partnering with product on roadmap, and owning end-to-end delivery from design to production. Requirements: 7+ years of experience in Go or Rust, strong communication skills, ability to ship fast, and demonstrated leadership of cross-functional initiatives. Bonus: experience with kubernetes, postgres, and event-driven architectures.";
    globalThis.fetch = vi.fn(() => mockHtml(`
      <html><head><title>Backend | Acme</title></head>
      <body>
        <nav>home about jobs</nav>
        <div class="job-description">${inside}</div>
        <footer>cookie banner</footer>
      </body></html>
    `)) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://acme.com/careers/backend");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.description).toContain("senior backend engineer");
    expect(r.description).toContain("Responsibilities");
    expect(r.description).not.toContain("cookie banner");
  });
});

describe("fetchJobFromUrl — stronger multi-signal gate (2026-06-28)", () => {
  it("REJECTS the 'job has been filled' / nav-junk page even when it contains substring signals", async () => {
    // Mimic the RBC failure case: an HTTP 200 page that's mostly whitespace
    // + nav + an apology. Single substring hits ("experience", "research",
    // "skills") used to slip through the old gate.
    globalThis.fetch = vi.fn(() => mockHtml(`
      <html><head><title>Filled | RBC</title></head>
      <body>
        <nav>Technology Analytics Research Skills</nav>
        <p>We are sorry &mdash; the job you are trying to apply for has been filled.</p>
        <p>Find your next job. Choose a category.</p>
      </body></html>
    `)) as unknown as typeof fetch;
    const r = await fetchJobFromUrl("https://jobs.rbc.com/ca/en/job/EXPIRED/role");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/(could not extract|expired|filled|paste)/i);
  });

  it("REJECTS a page with only one job-content signal", async () => {
    globalThis.fetch = vi.fn(() => mockHtml(`
      <html><body>
        <p>${"a".repeat(500)}</p>
        <p>You will benefit from working remotely.</p>
      </body></html>
    `)) as unknown as typeof fetch;
    // "benefits" is the only signal — should be rejected by the >= 3 count
    const r = await fetchJobFromUrl("https://example.com/garbage");
    expect(r.ok).toBe(false);
  });
});

describe("fetchJobFromUrl — Workday (2026-06-30, fix/jobs-fetch-workday)", () => {
  it("extracts from the public CXS API on a wd1 / Search tenant (KLA-style URL)", async () => {
    globalThis.fetch = vi.fn((url) => {
      expect(String(url)).toBe(
        "https://kla.wd1.myworkdayjobs.com/wday/cxs/kla/Search/job/Deputy-Chief-Information-Security-Officer--CISO-_2636445"
      );
      return mockJson({
        jobPostingInfo: {
          title:          "Deputy Chief Information Security Officer (CISO)",
          jobDescription: "<p>You will lead our information security program. Responsibilities include partnering with engineering, owning the risk register, and reporting to the CISO. Requirements: 10+ years of experience in information security, deep expertise in cloud security, and demonstrated leadership of cross-functional initiatives. Strong communication skills required.</p>",
          location:       "USA-MN-Remote-US04K",
          jobReqId:       "2636445",
        },
      });
    }) as unknown as typeof fetch;

    const r = await fetchJobFromUrl(
      "https://kla.wd1.myworkdayjobs.com/en-US/Search/details/Deputy-Chief-Information-Security-Officer--CISO-_2636445"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("workday");
    expect(r.title).toBe("Deputy Chief Information Security Officer (CISO)");
    expect(r.company).toBe("Kla");
    expect(r.location).toBe("USA-MN-Remote-US04K");
    expect(r.description).toContain("information security program");
    expect(r.description).toContain("Responsibilities");
    expect(r.description).not.toContain("<p>");
  });

  it("handles wd12 shard + multi-word site name + JR-prefixed slug (Salesforce-style)", async () => {
    globalThis.fetch = vi.fn((url) => {
      expect(String(url)).toBe(
        "https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site/job/Sr-Solution-Architect_JR342230"
      );
      return mockJson({
        jobPostingInfo: {
          title:          "Senior Solution Architect, Retail Execution/Trade",
          jobDescription: "<div>Lead our retail execution practice. You will build distributed systems, mentor the team, partner with product, and own end-to-end delivery. Requirements: 8+ years of experience in solution architecture, strong communication, and deep expertise in cloud platforms.</div>",
          location:       "Indiana - Remote",
        },
      });
    }) as unknown as typeof fetch;
    const r = await fetchJobFromUrl(
      "https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/details/Sr-Solution-Architect_JR342230"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("workday");
    expect(r.company).toBe("Salesforce");
    expect(r.description).toContain("retail execution");
  });

  it("handles URL without a locale segment", async () => {
    globalThis.fetch = vi.fn((url) => {
      expect(String(url)).toBe(
        "https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/job/Cyber-IR-Lead_R168701"
      );
      return mockJson({
        jobPostingInfo: {
          title:          "Cyber Incident Response Lead",
          jobDescription: "We are looking for an IR lead. Responsibilities include leading incident response, owning runbooks, and you will collaborate with engineering. Requirements: 5+ years in security operations, strong skills in forensics.",
          location:       "Bucharest",
        },
      });
    }) as unknown as typeof fetch;
    const r = await fetchJobFromUrl(
      "https://adobe.wd5.myworkdayjobs.com/external_experienced/details/Cyber-IR-Lead_R168701"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("workday");
    expect(r.title).toBe("Cyber Incident Response Lead");
  });

  it("translates Workday CXS 404 to 'no longer listed'", async () => {
    globalThis.fetch = vi.fn(() => mockJson({}, { status: 404 })) as unknown as typeof fetch;
    const r = await fetchJobFromUrl(
      "https://kla.wd1.myworkdayjobs.com/en-US/Search/details/Expired_999"
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/no longer listed/i);
  });

  it("falls through to the generic HTML path when the Workday URL path doesn't match", async () => {
    // Path doesn't have /details/ or /job/ — unparseable. tryWorkday() must
    // return null so the generic HTML strategy can take over.
    globalThis.fetch = vi.fn(() => mockHtml(`
      <html><head><title>Some Workday Page</title></head>
      <body>
        <script type="application/ld+json">${JSON.stringify({
          "@type":"JobPosting",
          title:"From JSON-LD",
          description:"This is a real job description with sufficient length to pass the gate. Responsibilities include x, y, and z. Requirements: experience, skills, and qualifications. You will collaborate.".repeat(2),
          hiringOrganization:{name:"Acme"},
        })}</script>
      </body></html>
    `)) as unknown as typeof fetch;
    const r = await fetchJobFromUrl(
      "https://acme.wd5.myworkdayjobs.com/some/unusual/path"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("html"); // JSON-LD branch tags as "html" via maybeWrap
    expect(r.title).toBe("From JSON-LD");
  });

  it("treats myworkdayjobs.com as NOT blocked (was in BLOCKED_HOSTS before this PR)", async () => {
    globalThis.fetch = vi.fn(() => mockJson({
      jobPostingInfo: {
        title:          "Test Role",
        jobDescription: "Lead a team. Responsibilities include strategy. Requirements: experience and skills. You will deliver.",
        location:       "Remote",
      },
    })) as unknown as typeof fetch;
    const r = await fetchJobFromUrl(
      "https://acme.wd1.myworkdayjobs.com/en-US/Search/details/Test_R1"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("workday");
  });
});
