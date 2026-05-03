/**
 * Profile export — generate a downloadable resume document from the current
 * Career Profile form state on /mycareer/profile.
 *
 * Five formats per the canonical spec (Amir 2026-05-03):
 *   - DOCX  → Microsoft Word, modern (.docx, OOXML, Office 2007+)
 *   - DOC   → Microsoft Word, legacy filename (we generate the same DOCX
 *             content but save with .doc extension; modern Word + Pages
 *             both open it without complaint, and true legacy .doc binary
 *             generation isn't realistic in the browser)
 *   - ATS   → Plain text optimized for ATS keyword scanning (single-column,
 *             no tables/headers, hyphenated bullets, all caps section
 *             headings)
 *   - PDF   → Native PDF via jspdf
 *   - TXT   → Clean plain text
 *
 * All five generate client-side from the form state passed in — no server
 * round-trip, no AI call, always reflects what the user is editing right now.
 */

import { saveAs } from "file-saver";

// ── Profile shape (subset of /mycareer/profile state we need to render) ──────
export interface ExportableProfile {
  fullName:      string;
  email:         string;
  phone:         string;
  location:      string;
  linkedinUrl:   string;
  headline:      string;
  summary:       string;
  workExp:       Array<{ title: string; company: string; startDate: string; endDate: string; description: string }>;
  education:     Array<{ degree: string; institution: string; year: string }>;
  certifications: string[];
  skills:        string[];
  portfolioItems: Array<{ title: string; url: string; desc: string }>;
}

export type ExportFormat = "docx" | "doc" | "ats" | "pdf" | "txt";

// ── Public entry point ───────────────────────────────────────────────────────
export async function exportProfile(format: ExportFormat, profile: ExportableProfile): Promise<void> {
  const safeName = (profile.fullName || "career-profile").trim().replace(/\s+/g, "_");
  const filename = `${safeName}_resume`;

  switch (format) {
    case "docx":
    case "doc":  return exportWord(profile, filename, format);
    case "ats":  return exportPlainText(profile, filename, "ats");
    case "txt":  return exportPlainText(profile, filename, "txt");
    case "pdf":  return exportPdf(profile, filename);
  }
}

// ── DOCX / DOC (Microsoft Word) ──────────────────────────────────────────────
async function exportWord(p: ExportableProfile, filename: string, ext: "docx" | "doc"): Promise<void> {
  // Lazy import — docx is heavy (~200KB), only load when user actually exports.
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

  const para = (text: string, opts: Record<string, unknown> = {}) =>
    new Paragraph({ children: [new TextRun({ text, ...opts })] });

  const heading = (text: string) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_2 });

  const children: InstanceType<typeof Paragraph>[] = [];

  // ── Header: name, headline, contact ─────────────────────────────────────
  if (p.fullName) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: p.fullName, bold: true })],
    }));
  }
  if (p.headline) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: p.headline, italics: true })],
    }));
  }
  const contactLine = [p.email, p.phone, p.location, p.linkedinUrl].filter(Boolean).join("  •  ");
  if (contactLine) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(contactLine)] }));
  }
  children.push(para(""));

  // ── Summary ─────────────────────────────────────────────────────────────
  if (p.summary) {
    children.push(heading("PROFESSIONAL SUMMARY"));
    children.push(para(p.summary));
    children.push(para(""));
  }

  // ── Work experience ─────────────────────────────────────────────────────
  if (p.workExp.length > 0) {
    children.push(heading("WORK EXPERIENCE"));
    for (const w of p.workExp) {
      const titleLine = [w.title, w.company].filter(Boolean).join(" — ");
      const dateLine  = [w.startDate, w.endDate].filter(Boolean).join(" – ");
      if (titleLine) children.push(new Paragraph({ children: [new TextRun({ text: titleLine, bold: true })] }));
      if (dateLine)  children.push(new Paragraph({ children: [new TextRun({ text: dateLine, italics: true })] }));
      if (w.description) {
        // Split bullets by newline; each becomes its own paragraph
        const bullets = w.description.split(/\r?\n/).filter(Boolean);
        for (const b of bullets) {
          children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
        }
      }
      children.push(para(""));
    }
  }

  // ── Education ───────────────────────────────────────────────────────────
  if (p.education.length > 0) {
    children.push(heading("EDUCATION"));
    for (const e of p.education) {
      const line = [e.degree, e.institution].filter(Boolean).join(" — ") + (e.year ? `, ${e.year}` : "");
      children.push(para(line));
    }
    children.push(para(""));
  }

  // ── Certifications ──────────────────────────────────────────────────────
  if (p.certifications.length > 0) {
    children.push(heading("CERTIFICATIONS"));
    for (const c of p.certifications) {
      children.push(new Paragraph({ text: c, bullet: { level: 0 } }));
    }
    children.push(para(""));
  }

  // ── Skills ──────────────────────────────────────────────────────────────
  if (p.skills.length > 0) {
    children.push(heading("SKILLS"));
    children.push(para(p.skills.join(" · ")));
    children.push(para(""));
  }

  // ── Portfolio & achievements ────────────────────────────────────────────
  if (p.portfolioItems.length > 0) {
    children.push(heading("PORTFOLIO & ACHIEVEMENTS"));
    for (const it of p.portfolioItems) {
      const head = [it.title, it.url].filter(Boolean).join(" — ");
      if (head) children.push(new Paragraph({ children: [new TextRun({ text: head, bold: true })] }));
      if (it.desc) children.push(para(it.desc));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.${ext}`);
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function exportPdf(p: ExportableProfile, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 50;
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  function ensureSpace(rows: number) {
    if (y + rows * 14 > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function writeWrapped(text: string, fontSize: number, opts: { bold?: boolean; italic?: boolean; align?: "left" | "center" } = {}): void {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal");
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    for (const line of lines as string[]) {
      ensureSpace(1);
      const x = opts.align === "center" ? pageWidth / 2 : margin;
      doc.text(line, x, y, { align: opts.align });
      y += fontSize * 1.25;
    }
  }

  function divider(): void {
    y += 6;
    ensureSpace(1);
    doc.setDrawColor(180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  }

  function sectionHeading(text: string): void {
    y += 6;
    ensureSpace(2);
    writeWrapped(text.toUpperCase(), 12, { bold: true });
    divider();
  }

  // Header
  if (p.fullName) writeWrapped(p.fullName, 18, { bold: true, align: "center" });
  if (p.headline) writeWrapped(p.headline, 11, { italic: true, align: "center" });
  const contact = [p.email, p.phone, p.location, p.linkedinUrl].filter(Boolean).join("  •  ");
  if (contact) writeWrapped(contact, 10, { align: "center" });

  if (p.summary) {
    sectionHeading("Professional Summary");
    writeWrapped(p.summary, 10);
  }

  if (p.workExp.length > 0) {
    sectionHeading("Work Experience");
    for (const w of p.workExp) {
      const titleLine = [w.title, w.company].filter(Boolean).join(" — ");
      const dateLine  = [w.startDate, w.endDate].filter(Boolean).join(" – ");
      if (titleLine) writeWrapped(titleLine, 11, { bold: true });
      if (dateLine)  writeWrapped(dateLine, 9, { italic: true });
      if (w.description) {
        for (const b of w.description.split(/\r?\n/).filter(Boolean)) {
          writeWrapped(`• ${b}`, 10);
        }
      }
      y += 4;
    }
  }

  if (p.education.length > 0) {
    sectionHeading("Education");
    for (const e of p.education) {
      const line = [e.degree, e.institution].filter(Boolean).join(" — ") + (e.year ? `, ${e.year}` : "");
      writeWrapped(line, 10);
    }
  }

  if (p.certifications.length > 0) {
    sectionHeading("Certifications");
    for (const c of p.certifications) writeWrapped(`• ${c}`, 10);
  }

  if (p.skills.length > 0) {
    sectionHeading("Skills");
    writeWrapped(p.skills.join(" · "), 10);
  }

  if (p.portfolioItems.length > 0) {
    sectionHeading("Portfolio & Achievements");
    for (const it of p.portfolioItems) {
      const head = [it.title, it.url].filter(Boolean).join(" — ");
      if (head) writeWrapped(head, 11, { bold: true });
      if (it.desc) writeWrapped(it.desc, 10);
    }
  }

  doc.save(`${filename}.pdf`);
}

// ── ATS / TXT (plain text) ────────────────────────────────────────────────────
function exportPlainText(p: ExportableProfile, filename: string, format: "ats" | "txt"): void {
  const lines: string[] = [];
  const sep = format === "ats" ? "" : "─".repeat(60);

  if (p.fullName) lines.push(p.fullName.toUpperCase());
  if (p.headline) lines.push(p.headline);
  const contact = [p.email, p.phone, p.location, p.linkedinUrl].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  lines.push("");

  function section(title: string) {
    if (sep) lines.push(sep);
    lines.push(title.toUpperCase());
    if (sep) lines.push(sep);
  }

  if (p.summary) {
    section("Professional Summary");
    lines.push(p.summary);
    lines.push("");
  }

  if (p.workExp.length > 0) {
    section("Work Experience");
    for (const w of p.workExp) {
      const titleLine = [w.title, w.company].filter(Boolean).join(" — ");
      const dateLine  = [w.startDate, w.endDate].filter(Boolean).join(" - ");
      if (titleLine) lines.push(titleLine);
      if (dateLine)  lines.push(dateLine);
      if (w.description) {
        for (const b of w.description.split(/\r?\n/).filter(Boolean)) {
          lines.push(`- ${b}`);
        }
      }
      lines.push("");
    }
  }

  if (p.education.length > 0) {
    section("Education");
    for (const e of p.education) {
      const line = [e.degree, e.institution].filter(Boolean).join(" — ") + (e.year ? `, ${e.year}` : "");
      lines.push(line);
    }
    lines.push("");
  }

  if (p.certifications.length > 0) {
    section("Certifications");
    for (const c of p.certifications) lines.push(`- ${c}`);
    lines.push("");
  }

  if (p.skills.length > 0) {
    section("Skills");
    // ATS prefers comma-separated keyword lists, easier to parse
    lines.push(format === "ats" ? p.skills.join(", ") : p.skills.join(" · "));
    lines.push("");
  }

  if (p.portfolioItems.length > 0) {
    section("Portfolio & Achievements");
    for (const it of p.portfolioItems) {
      const head = [it.title, it.url].filter(Boolean).join(" — ");
      if (head) lines.push(head);
      if (it.desc) lines.push(it.desc);
      lines.push("");
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${filename}.txt`);
}
