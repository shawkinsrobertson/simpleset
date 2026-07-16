import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Extracts text from a PDF, reconstructing rough line breaks from the
 * text items' y-position (pdf.js gives a flat stream of positioned items,
 * not lines). Scanned/image-only PDFs (no embedded text layer) are out of
 * scope for V1 — they'll come back empty and the caller should warn.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    let lastY: number | null = null;
    let currentLine: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(currentLine.join(''));
        currentLine = [];
      }
      currentLine.push(item.str);
      lastY = y;
    }
    if (currentLine.length) lines.push(currentLine.join(''));
    lines.push('');
  }

  return lines.join('\n');
}
