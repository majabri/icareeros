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
    expect(HIRE_CONFIG.navItems).toHaveLength(3);
    expect(HIRE_CONFIG.navItems.map(i => i.href)).toEqual([
      "/dashboard", "/jobs", "/invites",
    ]);
    expect(HIRE_CONFIG.footerItems).toHaveLength(1);
    expect(HIRE_CONFIG.footerItems[0].href).toBe("/profile");

    // Find Talent has the multi-prefix matcher so /candidates/* lights it up too.
    const findTalent = HIRE_CONFIG.navItems.find(i => i.label === "Find Talent");
    expect(findTalent?.matchPrefixes).toEqual(["/dashboard", "/candidates"]);

    // The two stubs are marked Soon.
    expect(HIRE_CONFIG.navItems.find(i => i.href === "/jobs")?.comingSoon).toBe(true);
    expect(HIRE_CONFIG.navItems.find(i => i.href === "/invites")?.comingSoon).toBe(true);
  });

  it("isNavItemActive resolves single-prefix and multi-prefix items correctly", () => {
    const single: NavItem = { href: "/jobs", label: "X", icon: "M0 0" };
    expect(isNavItemActive("/jobs",           single)).toBe(true);
    expect(isNavItemActive("/jobs/123",       single)).toBe(true);
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
});
