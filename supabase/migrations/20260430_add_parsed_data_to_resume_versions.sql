-- Add parsed_data column to resume_versions
-- Applied 2026-04-30 to kuneabeiwcxavvyyfjkx (icareeros prod)
-- Stores structured JSON extracted from the resume (contact, experience, education, skills, certifications).

ALTER TABLE public.resume_versions
  ADD COLUMN IF NOT EXISTS parsed_data jsonb;

COMMENT ON COLUMN public.resume_versions.parsed_data IS 'Structured data extracted from resume (contact, experience, education, skills, certifications)';
