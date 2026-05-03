/**
 * Resume-intake form schema (SPEC-002 §2.3).
 *
 * Note on naming reconciliation vs the spec:
 * - spec wrote `email` → we map to user_profiles.contact_email (existing column)
 * - spec wrote `work_history` → we map to user_profiles.work_experience (existing jsonb)
 * Other spec field names line up 1:1 with user_profiles columns.
 *
 * The user manually authors every field. The browser-extracted text is shown
 * as a reference pane — never auto-populated into the structured fields except
 * for trivial regex on email/phone (which have unambiguous patterns).
 */

import { z } from "zod";

export const workExperienceSchema = z.object({
  title:    z.string().min(1, "Job title is required"),
  company:  z.string().min(1, "Company is required"),
  location: z.string().optional().default(""),
  start:    z.string().min(1, "Start date is required"),
  end:      z.string().optional().default(""),
  current:  z.boolean().default(false),
  bullets:  z.array(z.string()).default([]),
});

export const educationSchema = z.object({
  school: z.string().min(1, "School is required"),
  degree: z.string().optional().default(""),
  field:  z.string().optional().default(""),
  start:  z.string().optional().default(""),
  end:    z.string().optional().default(""),
});

export const profileSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  email:     z.string().email("Valid email required"),
  phone:     z.string().optional().default(""),
  location:  z.string().optional().default(""),
  headline:  z.string().optional().default(""),
  summary:   z.string().optional().default(""),
  work_history: z.array(workExperienceSchema).default([]),
  education:    z.array(educationSchema).default([]),
  skills:       z.array(z.string()).default([]),
  raw_text:        z.string().optional().default(""),
  raw_text_format: z.enum(["pdf", "docx", "doc", "txt", "manual"]),
});

export type WorkExperience = z.infer<typeof workExperienceSchema>;
export type Education      = z.infer<typeof educationSchema>;
export type Profile        = z.infer<typeof profileSchema>;
