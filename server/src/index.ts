import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import multer from "multer";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import gdocsRouter from "./routes/gdocs.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import { checkGrammar } from "./tools/grammar.js";
import { styleCheck } from "./tools/styleCheck.js";
import { seoCheck } from "./tools/seoCheck.js";
import { factCheck } from "./tools/factCheck.js";
import type { RawSuggestion } from "./types.js";
import { startPolling, stopPolling, updateLastContent } from "./gdocsSync.js";
import { getAuthClient, isAuthorized } from "./gdocs/googleAuth.js";
import { updateDocContent } from "./gdocs/googleApi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "../../client/dist");

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    let pageText = "";
    let lastY: number | null = null;
    let lastItemEndX = 0;

    for (const item of textContent.items) {
      if (!("str" in item) || !item.str) continue;

      const x: number = item.transform[4];
      const y: number = item.transform[5];

      if (lastY !== null) {
        const yDiff = Math.abs(y - lastY);
        if (yDiff > 5) {
          // New line — use newline, not space
          pageText += "\n";
        } else if (x > lastItemEndX + 1 && !pageText.endsWith(" ") && !item.str.startsWith(" ")) {
          // Gap on the same line that isn't already a space
          pageText += " ";
        }
      }

      pageText += item.str;
      lastY = y;
      lastItemEndX = x + (item.width ?? 0);
    }

    pageTexts.push(pageText.trim());
  }

  return pageTexts.join("\n\n");
}

async function extractPdfHtml(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  type LineItem = { text: string; fontSize: number; y: number; x: number };
  const allLines: LineItem[][] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items into lines by Y proximity
    const lineMap = new Map<number, { text: string; fontSize: number; x: number }[]>();
    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const fontSize = Math.abs(item.transform[3]);
      const x: number = item.transform[4];
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ text: item.str, fontSize, x });
    }

    // Sort lines top-to-bottom (PDF Y increases upward, so descending)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    const pageLines: LineItem[] = sortedYs.map((y) => {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const text = items.map((it) => it.text).join(" ").trim();
      const fontSize = Math.max(...items.map((it) => it.fontSize));
      return { text, fontSize, y, x: items[0]?.x ?? 0 };
    });

    allLines.push(pageLines);
  }

  const flat = allLines.flat();
  if (flat.length === 0) return "";

  // Determine body font size as the most common (mode) font size, rounded to 0.5pt
  const sizeFreq = new Map<number, number>();
  for (const line of flat) {
    const rounded = Math.round(line.fontSize * 2) / 2;
    sizeFreq.set(rounded, (sizeFreq.get(rounded) ?? 0) + 1);
  }
  let bodySize = flat[0].fontSize;
  let maxFreq = 0;
  for (const [size, freq] of sizeFreq) {
    if (freq > maxFreq) { maxFreq = freq; bodySize = size; }
  }

  // Collect distinct heading sizes (significantly larger than body)
  const headingSizes = [...new Set(
    flat
      .map((l) => Math.round(l.fontSize * 2) / 2)
      .filter((s) => s >= bodySize * 1.15)
  )].sort((a, b) => b - a); // largest first

  const tagForSize = (size: number): string | null => {
    const rounded = Math.round(size * 2) / 2;
    const idx = headingSizes.indexOf(rounded);
    if (idx === 0) return "h1";
    if (idx === 1) return "h2";
    if (idx === 2) return "h3";
    if (idx > 2) return "h3";
    return null;
  };

  // Build HTML
  const htmlParts: string[] = [];
  let paraLines: string[] = [];
  let prevY: number | null = null;

  const flushPara = () => {
    if (paraLines.length > 0) {
      htmlParts.push(`<p>${paraLines.join(" ")}</p>`);
      paraLines = [];
    }
  };

  for (const line of flat) {
    const tag = tagForSize(line.fontSize);
    if (tag) {
      flushPara();
      htmlParts.push(`<${tag}>${line.text}</${tag}>`);
    } else {
      // Large Y gap between body lines = paragraph break
      if (prevY !== null && Math.abs(line.y - prevY) > 18 && paraLines.length > 0) {
        flushPara();
      }
      paraLines.push(line.text);
    }
    prevY = line.y;
  }
  flushPara();

  return htmlParts.join("\n");
}

const app = express();
const port = process.env.PORT || 3001;

const UPLOADS_DIR = "uploads";
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(clientDist));
app.use("/api/gdocs", gdocsRouter);

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 2 * 1024 * 1024 },
});

if (!process.env.GROQ_API_KEY) {
  console.error("FATAL: GROQ_API_KEY is missing in .env.");
}

function safeUnlink(filePath: string | null | undefined) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err: unknown) {
    console.warn(
      `Could not delete temp file ${filePath}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

const MAX_CHARS = 12_000;

// ---------------------------------------------------------------------------
// POST /api/analyze  (original endpoint — kept fully intact for compatibility)
// ---------------------------------------------------------------------------

app.post("/api/analyze", upload.single("document"), async (req, res) => {
  const tempFilePath = req.file ? req.file.path : null;

  try {
    if (!process.env.GROQ_API_KEY) {
      safeUnlink(tempFilePath);
      return res
        .status(503)
        .json({ error: "Server configuration error: GROQ_API_KEY is not set." });
    }

    const { options, content: bodyContent } = req.body;

    let selectedOptions: {
      grammar: boolean;
      punctuation: boolean;
      paraphrase: boolean;
      passiveVoice: boolean;
      sentenceLength: boolean;
      seo: boolean;
      metaTitle?: string;
      metaDescription?: string;
      focusKeyword?: string;
    } = {
      grammar: true,
      punctuation: false,
      paraphrase: false,
      passiveVoice: false,
      sentenceLength: false,
      seo: false,
    };
    if (options) {
      try {
        const parsed = typeof options === "string" ? JSON.parse(options) : options;
        selectedOptions = { ...selectedOptions, ...parsed };
      } catch {
        /* use defaults */
      }
    }
    // Punctuation check retired (too many phantom fixes) — force it off even if a
    // stale client still requests it.
    selectedOptions.punctuation = false;

    let content = "";
    let seoContent = ""; // HTML when available, falls back to plain text
    if (tempFilePath) {
      try {
        const ext = req.file?.originalname?.toLowerCase().split(".").pop();
        if (ext === "pdf") {
          const buffer = fs.readFileSync(tempFilePath);
          [content, seoContent] = await Promise.all([
            extractPdfText(buffer),
            extractPdfHtml(buffer),
          ]);
        } else if (ext === "docx") {
          const buffer = fs.readFileSync(tempFilePath);
          const [textResult, htmlResult] = await Promise.all([
            mammoth.extractRawText({ buffer }),
            mammoth.convertToHtml({ buffer }),
          ]);
          content = textResult.value;
          seoContent = htmlResult.value || content;
        } else {
          content = fs.readFileSync(tempFilePath, "utf-8");
          seoContent = content;
        }
      } catch {
        safeUnlink(tempFilePath);
        return res.status(422).json({
          error: "Could not read the uploaded file. Supported formats: .txt, .md, .pdf, .docx.",
        });
      } finally {
        safeUnlink(tempFilePath);
      }
    } else if (bodyContent) {
      content = bodyContent;
      seoContent = bodyContent;
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "No content provided." });
    }

    let truncated = false;
    if (content.length > MAX_CHARS) {
      content = content.slice(0, MAX_CHARS);
      truncated = true;
    }
    if (seoContent.length > MAX_CHARS) {
      seoContent = seoContent.slice(0, MAX_CHARS);
    }

    // Grammar detection now lives entirely in Harper on the client — the LLM
    // grammar layer was removed because it hallucinated non-issues. The grammar
    // tool is only invoked for paraphrasing, which Harper can't do.
    const grammarPromise: Promise<RawSuggestion[]> = selectedOptions.paraphrase
      ? checkGrammar(content, { grammar: false, punctuation: false, paraphrase: true })
      : Promise.resolve([]);

    const [grammarSuggestions, styleSuggestions, seoResult] = await Promise.all([
      grammarPromise,
      styleCheck(content, {
        passiveVoice: selectedOptions.passiveVoice,
        sentenceLength: selectedOptions.sentenceLength,
      }),
      selectedOptions.seo
        ? seoCheck(seoContent, {
            metaTitle: selectedOptions.metaTitle,
            metaDescription: selectedOptions.metaDescription,
            focusKeyword: selectedOptions.focusKeyword,
          })
        : Promise.resolve(null),
    ]);

    const suggestions = [...grammarSuggestions, ...styleSuggestions];

    const responseObj: Record<string, unknown> = {
      suggestions,
      sourceContent: content,
    };
    if (seoResult) responseObj.seoResult = seoResult;
    if (truncated) {
      responseObj.warning = `Document truncated to ${MAX_CHARS} characters for processing.`;
    }

    return res.json(responseObj);
  } catch (error: unknown) {
    safeUnlink(tempFilePath);
    console.error("Unhandled error in /api/analyze:", error);
    return res.status(500).json({
      error: "Failed to process document.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/fact-check
// Fact-checks the already-extracted document text (sent as JSON `content`).
// Extracts verifiable claims and verifies each against live web search.
// Returns { factCheckResults: FactCheckResult[] }.
// ---------------------------------------------------------------------------

app.post("/api/fact-check", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res
        .status(503)
        .json({ error: "Server configuration error: GROQ_API_KEY is not set." });
    }

    const { content } = (req.body ?? {}) as { content?: string };
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "No content provided." });
    }

    const factCheckResults = await factCheck(String(content).slice(0, MAX_CHARS));
    return res.json({ factCheckResults });
  } catch (error: unknown) {
    console.error("Unhandled error in /api/fact-check:", error);
    return res.status(500).json({
      error: "Failed to fact-check document.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  let joinedSession: { sessionId: string; docId: string } | null = null;

  socket.on("gdocs:join", ({ sessionId, docId }: { sessionId: string; docId: string }) => {
    if (!isAuthorized(sessionId)) {
      socket.emit("gdocs:error", { message: "Not authorized. Reconnect your Google account." });
      return;
    }
    joinedSession = { sessionId, docId };
    socket.join(`session:${sessionId}`);
    startPolling(sessionId, docId, io);
  });

  socket.on("gdocs:leave", ({ sessionId, docId }: { sessionId: string; docId: string }) => {
    joinedSession = null;
    stopPolling(sessionId, docId);
    socket.leave(`session:${sessionId}`);
  });

  socket.on("disconnect", () => {
    if (joinedSession) {
      stopPolling(joinedSession.sessionId, joinedSession.docId);
    }
  });

  socket.on(
    "app:changed",
    async ({ sessionId, docId, html }: { sessionId: string; docId: string; html: string }) => {
      if (!isAuthorized(sessionId)) {
        socket.emit("app:changed:error", { message: "Not authorized." });
        return;
      }
      try {
        const auth = getAuthClient(sessionId);
        await updateDocContent(docId, html, auth);
        updateLastContent(sessionId, docId, html);
        socket.emit("app:changed:ack", { docId });
      } catch (err) {
        console.error("gdocs app:changed failed:", err);
        // A 403 means the connected Google session lacks Drive write scope
        // (typically a session authorized under the old read-only scope).
        const status = (err as { code?: number; status?: number })?.code
          ?? (err as { status?: number })?.status;
        if (status === 403) {
          socket.emit("app:changed:error", {
            message:
              "No write access to this document. Disconnect and reconnect your Google account to grant edit permission, then try again.",
            needsReauth: true,
          });
          return;
        }
        socket.emit("app:changed:error", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
});

httpServer.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
