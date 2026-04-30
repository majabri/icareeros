/**
 * POST /api/resume/extract-text
 * Pure text extraction — no AI. Accepts FormData { file }.
 * Supports PDF (pdf-parse), Word (mammoth), and plain text.
 * Returns { text: string }.
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (isPdf(file.type, file.name)) {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (isWord(file.type, file.name)) {
      const { value, messages } = await mammoth.extractRawText({ buffer });
      if (messages.length) console.warn("[extract-text]", messages.map(m => m.message).join("; "));
      text = value;
    } else {
      text = buffer.toString("utf-8");
    }

    text = text.trim();
    if (text.length < 20) return NextResponse.json({ error: "File appears empty or too short." }, { status: 422 });
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    console.error("[extract-text]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
