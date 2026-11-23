import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export class PdfError extends Error {
  constructor(message, code = "pdf_error", status = 422) {
    super(message);
    this.name = "PdfError";
    this.code = code;
    this.status = status;
  }
}

export async function extractPdfText(buffer) {
  let doc;
  try {
    doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true
    }).promise;
  } catch (error) {
    throw new PdfError(
      "This file could not be read as a PDF. Try exporting it again or paste the text.",
      "pdf_unreadable"
    );
  }

  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let pageText = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        pageText += "\n";
      } else if (pageText && !pageText.endsWith(" ") && !pageText.endsWith("\n")) {
        pageText += " ";
      }
      pageText += item.str;
      lastY = y;
    }
    pages.push(pageText.replace(/[ \t]+/g, " ").trim());
  }

  const text = pages.filter(Boolean).join("\n\n").trim();
  const letters = (text.match(/[A-Za-z\u00C0-\u024F\u0600-\u06FF]/g) || []).length;
  if (text.length < 40 || letters < 20) {
    throw new PdfError(
      "This PDF has no selectable text. It looks scanned, so there is nothing to simplify. Run OCR first, or paste the text.",
      "pdf_no_text_layer"
    );
  }
  return { text, pages: pages.length };
}
