/**
 * detailFetchers — unit tests for the pure parsers + rate pacer + circuit breaker.
 * Live prod HTTP proofs are captured in the PR body verbatim.
 */
import { describe, it, expect } from "vitest";
import {
  CircuitBreaker,
  DEFAULT_CIRCUIT_CONFIG,
  DEFAULT_RATE_CONFIG,
  parseGreenhouseResponse,
  parseGreenhouseUrl,
  parseSmartRecruitersExternalId,
  parseSmartRecruitersResponse,
  parseWorkdayResponse,
  parseWorkdayUrl,
  pickFetcher,
  stripHtml,
} from "../../supabase/functions/enrich-jobs/detailFetchers.ts";

describe("stripHtml", () => {
  it("strips tags + entities + collapses whitespace", () => {
    expect(stripHtml("<p>Hello <b>world</b>&nbsp;&amp; more</p>")).toBe("Hello world & more");
  });
  it("drops script + style content", () => {
    expect(stripHtml("<style>x{}</style>Hi<script>evil()</script>")).toBe("Hi");
  });
});

describe("parseGreenhouseUrl", () => {
  it("boards.greenhouse.io/{org}/jobs/{id}", () => {
    expect(parseGreenhouseUrl("https://boards.greenhouse.io/acme/jobs/1234"))
      .toEqual({ org: "acme", id: "1234" });
  });
  it("job-boards.greenhouse.io/{org}/jobs/{id}", () => {
    expect(parseGreenhouseUrl("https://job-boards.greenhouse.io/acme/jobs/5678?utm=x"))
      .toEqual({ org: "acme", id: "5678" });
  });
  it("returns null on non-greenhouse host", () => {
    expect(parseGreenhouseUrl("https://boards.lever.co/acme/1234")).toBeNull();
  });
  it("returns null on missing id", () => {
    expect(parseGreenhouseUrl("https://boards.greenhouse.io/acme")).toBeNull();
  });
  it("returns null on garbage", () => {
    expect(parseGreenhouseUrl("not-a-url")).toBeNull();
  });
});

describe("parseGreenhouseResponse", () => {
  it("extracts content field as stripped HTML", () => {
    expect(parseGreenhouseResponse({ content: "<p>Real JD content here</p>" }))
      .toBe("Real JD content here");
  });
  it("returns null on missing content", () => {
    expect(parseGreenhouseResponse({})).toBeNull();
  });
  it("returns null on empty content", () => {
    expect(parseGreenhouseResponse({ content: "" })).toBeNull();
  });
});

describe("parseSmartRecruitersExternalId", () => {
  it("splits {slug}:{postingId} form", () => {
    expect(parseSmartRecruitersExternalId("cohere:abc-123"))
      .toEqual({ slug: "cohere", postingId: "abc-123" });
  });
  it("returns null on null / empty / no-colon", () => {
    expect(parseSmartRecruitersExternalId(null)).toBeNull();
    expect(parseSmartRecruitersExternalId("")).toBeNull();
    expect(parseSmartRecruitersExternalId("cohere-abc-123")).toBeNull();
  });
});

describe("parseSmartRecruitersResponse", () => {
  it("extracts jobAd.sections.jobDescription.text", () => {
    const body = { jobAd: { sections: { jobDescription: { text: "<b>Reqs</b> here" } } } };
    expect(parseSmartRecruitersResponse(body)).toBe("Reqs here");
  });
  it("returns null on missing nested path", () => {
    expect(parseSmartRecruitersResponse({})).toBeNull();
    expect(parseSmartRecruitersResponse({ jobAd: {} })).toBeNull();
    expect(parseSmartRecruitersResponse({ jobAd: { sections: {} } })).toBeNull();
  });
  it("returns null on non-string text", () => {
    expect(parseSmartRecruitersResponse({ jobAd: { sections: { jobDescription: { text: 42 } } } })).toBeNull();
  });
});

describe("parseWorkdayUrl", () => {
  it("standard {tenant}.wd{n}.myworkdayjobs.com/{site}/{details|job}/{slugId}", () => {
    const r = parseWorkdayUrl("https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Toronto/Sr-Engineer_R-1234");
    expect(r).toEqual({
      origin: "https://acme.wd5.myworkdayjobs.com",
      tenant: "acme",
      site:   "careers",
      slugId: "Sr-Engineer_R-1234",
    });
  });
  it("-impl subdomain also matches", () => {
    const r = parseWorkdayUrl("https://acme.wd5-impl.myworkdayjobs.com/careers/details/Sr-Engineer_R-1234");
    expect(r?.origin).toBe("https://acme.wd5-impl.myworkdayjobs.com");
    expect(r?.tenant).toBe("acme");
  });
  it("returns null on non-workday host", () => {
    expect(parseWorkdayUrl("https://boards.greenhouse.io/acme/jobs/1")).toBeNull();
  });
});

describe("parseWorkdayResponse", () => {
  it("extracts jobPostingInfo.jobDescription as stripped HTML", () => {
    const body = { jobPostingInfo: { jobDescription: "<p>Real JD content</p>" } };
    expect(parseWorkdayResponse(body)).toBe("Real JD content");
  });
  it("returns null on missing jobPostingInfo", () => {
    expect(parseWorkdayResponse({})).toBeNull();
    expect(parseWorkdayResponse({ jobPostingInfo: {} })).toBeNull();
  });
});

describe("pickFetcher", () => {
  it("returns handler for greenhouse", () => {
    expect(pickFetcher("greenhouse")?.name).toBe("greenhouse");
  });
  it("returns handler for smartrecruiters", () => {
    expect(pickFetcher("smartrecruiters")?.name).toBe("smartrecruiters");
  });
  it("returns handler for workday", () => {
    expect(pickFetcher("workday")?.name).toBe("workday");
  });
  it("returns null for ashby / lever (already have descriptions)", () => {
    expect(pickFetcher("ashby")).toBeNull();
    expect(pickFetcher("lever")).toBeNull();
  });
});

describe("CircuitBreaker", () => {
  it("trips on 5 consecutive failures (default)", () => {
    const cb = new CircuitBreaker(DEFAULT_CIRCUIT_CONFIG);
    for (let i = 0; i < 4; i++) expect(cb.onFailure()).toBe(false);
    expect(cb.onFailure()).toBe(true);
    expect(cb.isTripped()).toBe(true);
  });
  it("resets consecutive counter on success but keeps total", () => {
    const cb = new CircuitBreaker({ consecutiveFailureThreshold: 3, totalFailureThreshold: 100 });
    cb.onFailure();
    cb.onFailure();
    cb.onSuccess();
    expect(cb.snapshot()).toEqual({ consecutive: 0, total: 2, tripped: false });
    cb.onFailure(); cb.onFailure(); cb.onFailure();
    expect(cb.isTripped()).toBe(true);
  });
  it("trips on total-failure threshold even without consecutive run", () => {
    const cb = new CircuitBreaker({ consecutiveFailureThreshold: 100, totalFailureThreshold: 3 });
    cb.onFailure(); cb.onSuccess();
    cb.onFailure(); cb.onSuccess();
    expect(cb.onFailure()).toBe(true);
  });
});

describe("DEFAULT_RATE_CONFIG — sanity", () => {
  it("all three sources have configured pacing", () => {
    expect(DEFAULT_RATE_CONFIG.greenhouse).toBeDefined();
    expect(DEFAULT_RATE_CONFIG.smartrecruiters).toBeDefined();
    expect(DEFAULT_RATE_CONFIG.workday).toBeDefined();
  });
  it("interRequestMs is at least 200ms (conservative)", () => {
    for (const src of ["greenhouse", "smartrecruiters", "workday"] as const) {
      expect(DEFAULT_RATE_CONFIG[src].interRequestMs).toBeGreaterThanOrEqual(200);
    }
  });
  it("maxPerInvocation × interRequestMs stays well inside the 15s per-source budget", () => {
    for (const src of ["greenhouse", "smartrecruiters", "workday"] as const) {
      const cfg = DEFAULT_RATE_CONFIG[src];
      const worstMs = cfg.maxPerInvocation * cfg.interRequestMs;
      expect(worstMs).toBeLessThanOrEqual(15_000);
    }
  });
});
