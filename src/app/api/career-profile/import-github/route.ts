/**
 * POST /api/career-profile/import-github
 *
 * Body: { username: string, confirm?: boolean }
 *
 * Fetches the user's GitHub public profile + their top repositories,
 * extracts languages + topics, returns either a PREVIEW (confirm=false)
 * or commits the merge to `career_profiles` (confirm=true).
 *
 * Merge semantics: existing skills + new GitHub-detected skills (union,
 * case-insensitive dedup). NO deletions.
 *
 * Persists `github_url` + `github_imported_at` on confirm.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { cookies } from "next/headers";

interface GithubUser {
  login:      string;
  name?:      string | null;
  bio?:       string | null;
  blog?:      string | null;
  company?:   string | null;
  location?:  string | null;
  html_url:   string;
  public_repos: number;
}

interface GithubRepo {
  name:        string;
  full_name:   string;
  fork:        boolean;
  archived:    boolean;
  language?:   string | null;
  topics?:     string[];
  description?: string | null;
  stargazers_count: number;
}

interface ImportPreview {
  ok:        true;
  username:  string;
  url:       string;
  name?:     string | null;
  bio?:      string | null;
  newSkills: string[];   // languages + topics, deduped against existing
  reposScanned: number;
}

interface ImportConfirmed extends ImportPreview {
  saved:     true;
  mergedSkillCount: number;
}

async function fetchGithubUser(username: string): Promise<GithubUser | null> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: { "Accept": "application/vnd.github+json", "User-Agent": "iCareerOS-GitHubImport/1.0" },
  });
  if (!res.ok) return null;
  return res.json() as Promise<GithubUser>;
}

async function fetchGithubRepos(username: string): Promise<GithubRepo[]> {
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`,
    { headers: { "Accept": "application/vnd.github+json", "User-Agent": "iCareerOS-GitHubImport/1.0" } },
  );
  if (!res.ok) return [];
  return res.json() as Promise<GithubRepo[]>;
}

function parseUsername(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  // Accept raw "username", "github.com/username", or "https://github.com/username[/...]"
  const m = t.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)(?:[/?#]|$)/i);
  if (m) return m[1];
  // Bare username — GitHub usernames are alphanumeric + hyphens
  if (/^[A-Za-z0-9-]+$/.test(t)) return t;
  return null;
}

function dedupeUnion(existing: string[], incoming: string[]): string[] {
  const seen = new Map<string, string>();
  for (const s of existing) {
    if (typeof s === "string" && s.trim()) seen.set(s.toLowerCase(), s);
  }
  for (const s of incoming) {
    const k = s.toLowerCase();
    if (!seen.has(k)) seen.set(k, s);
  }
  return Array.from(seen.values());
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(toSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try { toSet.forEach(({name,value,options}) => cookieStore.set(name, value, withCrossSubdomainCookie(options))); }
          catch { /* server-component */ }
        },
      },
    },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { username?: string; url?: string; confirm?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const raw = body.username || body.url || "";
  const username = parseUsername(raw);
  if (!username) {
    return NextResponse.json({ ok: false, error: "Please enter a valid GitHub username or URL." }, { status: 400 });
  }

  const gh = await fetchGithubUser(username);
  if (!gh) {
    return NextResponse.json({ ok: false, error: `GitHub user '${username}' not found or rate-limited. Try again in a moment.` }, { status: 422 });
  }

  const repos = await fetchGithubRepos(username);
  // Languages: dedupe across owned non-fork non-archived repos
  const languages = new Set<string>();
  const topics    = new Set<string>();
  let reposScanned = 0;
  for (const r of repos) {
    if (r.fork || r.archived) continue;
    reposScanned++;
    if (r.language) languages.add(r.language);
    for (const t of r.topics ?? []) topics.add(t);
  }
  const newSkillsRaw = [...languages, ...topics].sort();

  // Load existing profile so we can show how many new skills we'd add
  const { data: existing } = await supabase
    .from("career_profiles")
    .select("skills")
    .eq("user_id", user.id)
    .maybeSingle();
  const existingSkills: string[] = Array.isArray(existing?.skills) ? existing!.skills : [];
  const existingSet = new Set(existingSkills.map(s => s.toLowerCase()));
  const newSkills   = newSkillsRaw.filter(s => !existingSet.has(s.toLowerCase()));

  const preview: ImportPreview = {
    ok:        true,
    username,
    url:       gh.html_url,
    name:      gh.name,
    bio:       gh.bio,
    newSkills,
    reposScanned,
  };

  if (!body.confirm) {
    return NextResponse.json(preview);
  }

  // Commit: union-merge skills + persist github_url + github_imported_at
  const mergedSkills = dedupeUnion(existingSkills, newSkillsRaw);
  const { error: upsertErr } = await supabase
    .from("career_profiles")
    .upsert({
      user_id:             user.id,
      skills:              mergedSkills,
      github_url:          gh.html_url,
      github_imported_at:  new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: `Save failed: ${upsertErr.message}` }, { status: 500 });
  }

  const result: ImportConfirmed = {
    ...preview,
    saved:            true,
    mergedSkillCount: mergedSkills.length,
  };
  return NextResponse.json(result);
}
