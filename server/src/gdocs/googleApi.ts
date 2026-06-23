import { google } from "googleapis";
import { Readable } from "stream";
import type { AuthClient } from "./googleAuth.js";

export async function readDocContent(
  docId: string,
  auth: AuthClient,
): Promise<{ content: string; title: string }> {
  const docs = google.docs({ version: "v1", auth });
  const res = await docs.documents.get({ documentId: docId });
  const doc = res.data;
  const title = doc.title || "Untitled";

  // Maps Google Docs named styles to HTML tags. HEADING_3+ → h2 (TipTap max is h2).
  const HEADING_TAG: Record<string, string> = {
    TITLE: "h1",
    SUBTITLE: "h2",
    HEADING_1: "h1",
    HEADING_2: "h2",
    HEADING_3: "h2",
    HEADING_4: "h2",
    HEADING_5: "h2",
    HEADING_6: "h2",
  };

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = "";

  for (const element of doc.body?.content ?? []) {
    if (element.paragraph) {
      const styleType = element.paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";
      const tag = HEADING_TAG[styleType] ?? "p";

      let inner = "";
      for (const pe of element.paragraph.elements ?? []) {
        const text = pe.textRun?.content?.replace(/\n$/, "") ?? "";
        if (!text) continue;
        let chunk = esc(text);
        const ts = pe.textRun?.textStyle ?? {};
        if (ts.underline) chunk = `<u>${chunk}</u>`;
        if (ts.italic) chunk = `<em>${chunk}</em>`;
        if (ts.bold) chunk = `<strong>${chunk}</strong>`;
        inner += chunk;
      }

      if (inner.trim()) html += `<${tag}>${inner}</${tag}>`;
    } else if (element.table) {
      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          for (const ce of cell.content ?? []) {
            let inner = "";
            for (const pe of ce.paragraph?.elements ?? []) {
              const text = pe.textRun?.content?.replace(/\n$/, "") ?? "";
              if (text) inner += esc(text);
            }
            if (inner.trim()) html += `<p>${inner}</p>`;
          }
        }
      }
    }
  }

  return { content: html.trim(), title };
}

export async function listDriveFiles(
  query: string,
  auth: AuthClient,
): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const drive = google.drive({ version: "v3", auth });
  const q = query
    ? `mimeType='application/vnd.google-apps.document' and name contains '${query.replace(/'/g, "\\'")}'`
    : "mimeType='application/vnd.google-apps.document'";

  const res = await drive.files.list({
    q,
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 20,
  });

  return (res.data.files ?? []).map((f) => ({
    id: f.id ?? "",
    name: f.name ?? "Untitled",
    modifiedTime: f.modifiedTime ?? "",
  }));
}

export async function updateDocContent(
  docId: string,
  content: string,
  auth: AuthClient,
): Promise<void> {
  // HTML content: use Drive API upload which preserves bold, italic, headings, etc.
  if (content.trim().startsWith("<")) {
    const drive = google.drive({ version: "v3", auth });
    await drive.files.update({
      fileId: docId,
      media: { mimeType: "text/html", body: Readable.from(content) },
    });
    return;
  }

  // Plain text: use Docs batchUpdate
  const docs = google.docs({ version: "v1", auth });
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body?.content?.at(-1)?.endIndex ?? 1;

  const requests: Array<Record<string, unknown>> = [];
  if (endIndex > 2) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  }
  if (content.trim()) {
    requests.push({ insertText: { location: { index: 1 }, text: content } });
  }
  if (requests.length > 0) {
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
  }
}

export async function createDocFromContent(
  title: string,
  content: string,
  auth: AuthClient,
): Promise<{ docId: string; docUrl: string }> {
  // HTML content: upload via Drive API so bold, italic, headings, etc. are preserved
  if (content.trim().startsWith("<")) {
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.create({
      requestBody: { name: title, mimeType: "application/vnd.google-apps.document" },
      media: { mimeType: "text/html", body: Readable.from(content) },
    });
    const docId = res.data.id!;
    return { docId, docUrl: `https://docs.google.com/document/d/${docId}/edit` };
  }

  // Plain text: use Docs API
  const docs = google.docs({ version: "v1", auth });
  const createRes = await docs.documents.create({ requestBody: { title } });
  const docId = createRes.data.documentId!;

  if (content.trim()) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: content } }],
      },
    });
  }

  return { docId, docUrl: `https://docs.google.com/document/d/${docId}/edit` };
}
