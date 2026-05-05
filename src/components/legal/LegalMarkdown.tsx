import fs from "node:fs/promises";
import path from "node:path";

interface ParsedMarkdown {
  meta: { slug?: string; lastUpdated?: string; locale?: string };
  body: string;
}

async function readSource(slug: string, locale: string): Promise<ParsedMarkdown> {
  const candidates = [
    `${slug}.${locale}.md`,
    `${slug}.en.md`, // fallback to English
  ];
  let raw: string | null = null;
  for (const name of candidates) {
    try {
      raw = await fs.readFile(path.join(process.cwd(), "content", "legal", name), "utf8");
      break;
    } catch {
      // try next
    }
  }
  if (!raw) {
    return { meta: {}, body: "Content not available." };
  }
  // Parse minimal frontmatter delimited by ---
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fm) return { meta: {}, body: raw };
  const meta: ParsedMarkdown["meta"] = {};
  for (const line of fm[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.+?)\s*$/);
    if (m) (meta as Record<string, string>)[m[1]] = m[2];
  }
  return { meta, body: fm[2] };
}

/**
 * Tiny safe-ish markdown → HTML renderer. We control the source content so
 * we don't need a full parser; this handles headings, paragraphs, lists,
 * inline code, bold/italic, links, blockquotes, and tables.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;",
  );
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // Inline code: `text`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *text*  (avoid eating stars inside <strong>)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, "$1<em>$2</em>$3");
  // Links: [text](href) — only http(s), mailto, or root-relative
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|mailto:[^)]+|\/[^)]*)\)/g, '<a href="$2">$1</a>');
  return out;
}

function renderTable(lines: string[]): string {
  // lines includes header | --- | rows
  const head = lines[0].split("|").slice(1, -1).map((c) => c.trim());
  const rows = lines.slice(2).map((row) => row.split("|").slice(1, -1).map((c) => c.trim()));
  const headHtml = head.map((c) => `<th>${inline(c)}</th>`).join("");
  const rowsHtml = rows
    .filter((r) => r.length > 0 && r.some((c) => c !== ""))
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Headings
    const h = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (h) {
      const level = h[1].length;
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    // Horizontal rule
    if (line.match(/^---+\s*$/)) {
      out.push("<hr/>");
      i++;
      continue;
    }
    // Blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote>${buf.map(inline).join(" ")}</blockquote>`);
      continue;
    }
    // Table (line starts with `|` and next line is separator `|---|`)
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s|:-]+\|$/.test(lines[i + 1])) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        buf.push(lines[i]);
        i++;
      }
      out.push(renderTable(buf));
      continue;
    }
    // Lists
    if (/^(\s*)[-*+]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^(\s*)[-*+]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^(\s*)[-*+]\s+/, ""));
        i++;
      }
      out.push(`<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^(\s*)\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^(\s*)\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^(\s*)\d+\.\s+/, ""));
        i++;
      }
      out.push(`<ol>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ol>`);
      continue;
    }
    // Blank line → skip
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Paragraph: collect until blank line or block start
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].startsWith("|") &&
      !lines[i].startsWith("> ") &&
      !/^(\s*)[-*+]\s+/.test(lines[i]) &&
      !/^(\s*)\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

export async function LegalMarkdown({ slug, locale = "en" }: { slug: string; locale?: string }) {
  const { meta, body } = await readSource(slug, locale);
  const html = renderMarkdown(body);
  const fallback = locale !== "en" && meta.locale !== locale;
  return (
    <article className="legal-doc prose prose-sm max-w-none text-gray-800">
      {fallback && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This page is available in English only — translation pending.
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
