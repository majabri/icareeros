/**
 * POST /api/resume/extract-text
 * Pure text extraction — no AI. Accepts FormData { file }.
 * Supports PDF (pdf-parse), Word (.docx via mammoth, .doc via word-extractor),
 * and plain text.
 * Returns { text: string }.
 *
 * v3 — adds:
 *   • Old binary .doc support via word-extractor (OLE2 Compound Document)
 *   • Friendly error if mammoth fails on a corrupted .docx
 */
import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

function isDocx(type: string, name: string) {
  return (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  );
}

function isDoc(type: string, name: string) {
  return (
    type === "application/msword" ||
    name.toLowerCase().endsWith(".doc")
  );
}

function isPdf(type: string, name: string) {
  return type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

/**
 * OLE2 Compound Document magic bytes — the header of old binary .doc files.
 * Used to confirm an uploaded .doc is actually OLE2 and not something else.
 */
function isOldDocFormat(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0
  );
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file)
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json(
        { error: "File too large (max 10 MB)" },
        { status: 400 }
      );

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (isPdf(file.type, file.name)) {
      // ── PDF ──────────────────────────────────────────────────────────────
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      text = data.text;

    } else if (isDocx(file.type, file.name)) {
      // ── Modern .docx (OOXML) — handled by mammoth ─────────────────────
      try {
        const { value, messages } = await mammoth.extractRawText({ buffer });
        if (messages.length)
          console.warn("[extract-text]", messages.map((m) => m.message).join("; "));
        text = value;
      } catch (mammothErr) {
        const detail =
          mammothErr instanceof Error ? mammothErr.message : "unknown error";
        console.error("[extract-text] mammoth failed:", detail);
        return NextResponse.json(
          {
            error:
              "Could not read this .docx file — it may be corrupted. Try re-saving it in Word and uploading again.",
          },
          { status: 422 }
        );
      }

    } else if (isDoc(file.type, file.name)) {
      // ── Legacy .doc (OLE2 binary) — handled by word-extractor ─────────
      if (!isOldDocFormat(buffer)) {
        // File claims to be .doc but doesn't have OLE2 magic bytes —
        // it might actually be an XML-based .doc (Word 2003 XML). Try mammoth.
        try {
          const { value } = await mammoth.extractRawText({ buffer });
          text = value;
        } catch {
          return NextResponse.json(
            {
              error:
                "This .doc file format is not supported. Please open it in Word and save it as .docx, then upload again.",
            },
            { status: 422 }
          );
        }
      } else {
        try {
          // word-extractor requires a temp file path — write buffer to /tmp
          const { writeFileSync, unlinkSync } = await import("fs");
          const { join } = await import("path");
          const tmpPath = join("/tmp", `doc_${Date.now()}_${Math.random().toString(36).slice(2)}.doc`);
          writeFileSync(tmpPath, buffer);

          const WordExtractor = (await import("word-extractor")).default;
          const extractor = new WordExtractor();
          const doc = await extractor.extract(tmpPath);
          text = doc.getBody();

          // Clean up temp file
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
        } catch (docErr) {
          const detail = docErr instanceof Error ? docErr.message : "unknown error";
          console.error("[extract-text] word-extractor failed:", detail);
          return NextResponse.json(
            {
              error:
                "Could not read this .doc file. Please open it in Word and save it as .docx, then upload again.",
            },
            { status: 422 }
          );
        }
      }

    } else {
      // ── Plain text / fallback ─────────────────────────────────────────
      text = buffer.toString("utf-8");
    }

    text = text.trim();
    if (text.length < 20)
      return NextResponse.json(
        { error: "File appears empty or too short." },
        { status: 422 }
      );
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    console.error("[extract-text]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
