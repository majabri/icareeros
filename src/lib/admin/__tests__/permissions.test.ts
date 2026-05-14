import { describe, it, expect } from "vitest";
import { hasPermission, roleAtLeast, ROLE_HIERARCHY, PERMISSIONS } from "../permissions";

describe("hasPermission", () => {
  it("returns false for null/undefined role", () => {
    expect(hasPermission(null, "users.view_list")).toBe(false);
    expect(hasPermission(undefined, "users.view_list")).toBe(false);
  });

  it("super_admin holds every permission", () => {
    for (const p of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
      expect(hasPermission("super_admin", p)).toBe(true);
    }
  });

  it("viewer holds only system.view_metrics", () => {
    expect(hasPermission("viewer", "system.view_metrics")).toBe(true);
    expect(hasPermission("viewer", "users.view_list")).toBe(false);
    expect(hasPermission("viewer", "system.toggle_flags")).toBe(false);
    expect(hasPermission("viewer", "users.delete")).toBe(false);
  });

  it("support_l1 can view + respond + close tickets but not change plans", () => {
    expect(hasPermission("support_l1", "support.view_tickets")).toBe(true);
    expect(hasPermission("support_l1", "support.respond_tickets")).toBe(true);
    expect(hasPermission("support_l1", "support.close_tickets")).toBe(true);
    expect(hasPermission("support_l1", "users.change_plan")).toBe(false);
  });

  it("support_l2 can change plans + see billing but not suspend or refund", () => {
    expect(hasPermission("support_l2", "users.change_plan")).toBe(true);
    expect(hasPermission("support_l2", "billing.view")).toBe(true);
    expect(hasPermission("support_l2", "users.suspend")).toBe(false);
    expect(hasPermission("support_l2", "billing.refund")).toBe(false);
  });

  it("admin can suspend + delete opportunities + toggle flags but not delete users or assign roles", () => {
    expect(hasPermission("admin", "users.suspend")).toBe(true);
    expect(hasPermission("admin", "opportunities.delete")).toBe(true);
    expect(hasPermission("admin", "system.toggle_flags")).toBe(true);
    expect(hasPermission("admin", "users.delete")).toBe(false);
    expect(hasPermission("admin", "roles.assign")).toBe(false);
    expect(hasPermission("admin", "billing.refund")).toBe(false);
  });

  it("only super_admin can delete users + assign roles + run console + refund + comp plan", () => {
    const superOnly = ["users.delete", "roles.assign", "system.run_console_cmd", "billing.refund", "billing.comp_plan"] as const;
    for (const p of superOnly) {
      expect(hasPermission("super_admin", p)).toBe(true);
      expect(hasPermission("admin", p)).toBe(false);
      expect(hasPermission("support_l2", p)).toBe(false);
      expect(hasPermission("support_l1", p)).toBe(false);
      expect(hasPermission("viewer", p)).toBe(false);
    }
  });
});

describe("roleAtLeast", () => {
  it("respects strict hierarchy", () => {
    expect(roleAtLeast("super_admin", "admin")).toBe(true);
    expect(roleAtLeast("admin", "support_l2")).toBe(true);
    expect(roleAtLeast("support_l2", "support_l1")).toBe(true);
    expect(roleAtLeast("support_l1", "viewer")).toBe(true);
  });

  it("returns true at equality", () => {
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("support_l1", "support_l1")).toBe(true);
  });

  it("returns false when role is lower", () => {
    expect(roleAtLeast("viewer", "support_l1")).toBe(false);
    expect(roleAtLeast("support_l1", "support_l2")).toBe(false);
    expect(roleAtLeast("admin", "super_admin")).toBe(false);
  });

  it("returns false for null role", () => {
    expect(roleAtLeast(null, "viewer")).toBe(false);
    expect(roleAtLeast(undefined, "viewer")).toBe(false);
  });
});

describe("ROLE_HIERARCHY", () => {
  it("is strictly monotonic", () => {
    const order = ["viewer", "support_l1", "support_l2", "admin", "super_admin"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(ROLE_HIERARCHY[order[i]]).toBeGreaterThan(ROLE_HIERARCHY[order[i - 1]]);
    }
  });
});
