import { describe, it, expect } from "vitest";
import {
  JOBS_CONFIG,
  HIRE_CONFIG,
  isNavItemActive,
  type NavItem,
} from "@/components/shell/platform.config";

describe("platform configs", () => {
  it("JOBS_CONFIG identifies as jobs with the right branding", () => {
    expect(JOBS_CONFIG.id).toBe("jobs");
    expect(JOBS_CONFIG.tagline).toBe("Your Career OS");
    expect(JOBS_CONFIG.sidebarLabel).toBe("Career OS");
  });

  it("HIRE_CONFIG identifies as hire with the right branding + nav items", () => {
    expect(HIRE_CONFIG.id).toBe("hire");
    expect(HIRE_CONFIG.tagline).toBe("Hire smarter, not harder");
    expect(HIRE_CONFIG.sidebarLabel).toBe("Hire OS");

    // 1 Dashboard + 1 section divider + 6 stages = 8 items
    expect(HIRE_CONFIG.navItems).toHaveLength(8);
    expect(HIRE_CONFIG.navItems.map(i => i.href)).toEqual([
      "/dashboard",
      "#section-people-retention-pathway",
      "/design",
      "/select",
      "/integrate",
      "/support",
      "/develop",
      "/retain",
    ]);

    // Top item — iCareerOS Dashboard — keeps multi-prefix matcher so
    // /candidates/* still lights up the row.
    const dashboard = HIRE_CONFIG.navItems.find(i => i.label === "iCareerOS Dashboard");
    expect(dashboard?.matchPrefixes).toEqual(["/dashboard", "/candidates"]);

    // Section divider has type='section' and no real route.
    const divider = HIRE_CONFIG.navItems.find(i => i.type === "section");
    expect(divider?.label).toBe("People Retention Pathway");

    // Footer items: Company Profile + Settings, in that order.
    expect(HIRE_CONFIG.footerItems).toHaveLength(2);
    expect(HIRE_CONFIG.footerItems.map(i => i.href)).toEqual(["/profile", "/settings"]);
    expect(HIRE_CONFIG.footerItems.map(i => i.label)).toEqual(["Company Profile", "Settings"]);
  });

  it("HIRE_CONFIG pathway stages have stage numbers, colours, and plan locks", () => {
    const stages = HIRE_CONFIG.navItems.filter(i => i.stageNumber);
    expect(stages).toHaveLength(6);

    // Stage numbers in order
    expect(stages.map(s => s.stageNumber)).toEqual(["01", "02", "03", "04", "05", "06"]);

    // Stage colours from design-tokens — verify the rotation matches
    // STAGE_COLORS_MAP order (evaluate / advise / learn / act / coach / achieve).
    expect(stages.map(s => s.color)).toEqual([
      "#00B8A9", // 01 Design  → evaluate (teal)
      "#FF6B6B", // 02 Select  → advise   (coral)
      "#F5A623", // 03 Integrate → learn  (gold)
      "#10B981", // 04 Support → act      (green)
      "#7B9AC0", // 05 Develop → coach    (slate blue)
      "#40C9C0", // 06 Retain  → achieve  (light teal)
    ]);

    // Free plan: Design + Select unlocked. Everything else Starter+.
    expect(stages.find(s => s.label === "Design")?.locked).toBe(false);
    expect(stages.find(s => s.label === "Select")?.locked).toBe(false);
    expect(stages.find(s => s.label === "Integrate")?.locked).toBe(true);
    expect(stages.find(s => s.label === "Support")?.locked).toBe(true);
    expect(stages.find(s => s.label === "Develop")?.locked).toBe(true);
    expect(stages.find(s => s.label === "Retain")?.locked).toBe(true);

    // Stage 04 Support routes to /support — Phase 4 middleware rewrites
    // it to /hire/support on hire.*; PR #278 placed the page there.
    expect(stages.find(s => s.label === "Support")?.href).toBe("/support");
  });

  it("isNavItemActive resolves single-prefix and multi-prefix items correctly", () => {
    const single: NavItem = { href: "/opportunities", label: "X", icon: "M0 0" };
    expect(isNavItemActive("/opportunities",           single)).toBe(true);
    expect(isNavItemActive("/opportunities/123",       single)).toBe(true);
    expect(isNavItemActive("/jobsearch",      single)).toBe(false); // prefix must be /-bounded
    expect(isNavItemActive("/dashboard",      single)).toBe(false);

    const multi: NavItem = {
      href: "/dashboard",
      label: "Find Talent",
      icon: "M0 0",
      matchPrefixes: ["/dashboard", "/candidates"],
    };
    expect(isNavItemActive("/dashboard",           multi)).toBe(true);
    expect(isNavItemActive("/candidates",          multi)).toBe(true);
    expect(isNavItemActive("/candidates/abc",      multi)).toBe(true);
    expect(isNavItemActive("/profile",             multi)).toBe(false);
  });

  it("isNavItemActive returns false for section entries", () => {
    const section: NavItem = {
      type:  "section",
      href:  "#section-foo",
      label: "Foo",
      icon:  "",
    };
    expect(isNavItemActive("/dashboard",              section)).toBe(false);
    expect(isNavItemActive("#section-foo",           section)).toBe(false);
    expect(isNavItemActive("/anything",               section)).toBe(false);
  });
});
