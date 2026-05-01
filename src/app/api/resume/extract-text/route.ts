/**
 * POST /api/resume/extract-text
 * Pure text extraction — no AI. Accepts FormData { file }.
 * Supports PDF (pdf-parse), Word (.docx only), and plain text.
 * Returns { text: string }.
 *
 * v2 — fixes:
 *   • Detects old binary .doc format (OLE2 magic bytes) and returns a clear user error
 *   • Wraps mammoth in try-catch so corrupted DOCX gives a friendly message
 */
import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

function isWord(type: string, name: string) {
  return (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword" ||
    name.toLowerCase().endsWith(".docx") ||
    name.toLowerCase().endsWith(".doc")
  );
}

function isPdf(type: string, name: string) {
  return type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

/**
 * OLE2 Compound Document magic bytes — the header of old binary .doc files.
 * Mammoth only supports .docx (OOXML) and will throw "Could not find the body element"
 * when handed an OLE2 file, so we detect and reject early.
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
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (isWord(file.type, file.name)) {
      // Detect old binary .doc (OLE2) format — mammoth cannot read these
      if (isOldDocFormat(buffer)) {
        return NextResponse.json(
          {
            error:
              "Old .doc format is not supported. Please open the file in Word and save it as .docx (File → Save As → Word Document), then upload again.",
          },
          { status: 422 }
        );
      }

      try {
        const { value, messages } = await mammoth.extractRawText({ buffer });
        if (messages.length)
          console.warn(
            "[extract-text]",
            messages.map((m) => m.message).join("; ")
          );
        text = value;
      } catch (mammothErr) {
        const detail =
          mammothErr instanceof Error ? mammothErr.message : "unknown error";
        console.error("[extract-text] mammoth failed:", detail);
        return NextResponse.json(
          {
            error:
              "Could not read this Word file. If it is a .doc file, please save it as .docx and try again. If it is already a .docx, the file may be corrupted.",
          },
          { status: 422 }
        );
      }
    } else {
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
