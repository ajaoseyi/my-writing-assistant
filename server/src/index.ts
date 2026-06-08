import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import { checkGrammar } from "./tools/grammar.js";
import { compiledGraph, Command } from "./graph.js";
import type {
  AnalyzeFullResponse,
  DetectedTone,
  InterruptedResponse,
} from "./types.js";
import { TONE_OPTIONS } from "./types.js";

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

const app = express();
const port = process.env.PORT || 3001;

const UPLOADS_DIR = "uploads";
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(clientDist));

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

/** Extracts and validates document content from the request, truncating if necessary. */
async function extractContent(
  req: express.Request,
  tempFilePath: string | null,
): Promise<{ content: string; truncated: boolean } | { error: string; status: number }> {
  let content = "";

  if (tempFilePath) {
    try {
      const ext = req.file?.originalname?.toLowerCase().split(".").pop();
      if (ext === "pdf") {
        const buffer = fs.readFileSync(tempFilePath);
        content = await extractPdfText(buffer);
      } else if (ext === "docx") {
        const buffer = fs.readFileSync(tempFilePath);
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } else {
        content = fs.readFileSync(tempFilePath, "utf-8");
      }
    } catch {
      return {
        error: "Could not read the uploaded file. Supported formats: .txt, .md, .pdf, .docx.",
        status: 422,
      };
    } finally {
      safeUnlink(tempFilePath);
    }
  } else if (req.body?.content) {
    content = req.body.content;
  }

  if (!content || content.trim().length === 0) {
    return { error: "No content provided.", status: 400 };
  }

  let truncated = false;
  if (content.length > MAX_CHARS) {
    content = content.slice(0, MAX_CHARS);
    truncated = true;
  }

  return { content, truncated };
}

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

    let selectedOptions = { grammar: true, punctuation: true, paraphrase: false };
    if (options) {
      try {
        selectedOptions =
          typeof options === "string" ? JSON.parse(options) : options;
      } catch {
        /* use defaults */
      }
    }

    let content = "";
    if (tempFilePath) {
      try {
        const ext = req.file?.originalname?.toLowerCase().split(".").pop();
        if (ext === "pdf") {
          const buffer = fs.readFileSync(tempFilePath);
          content = await extractPdfText(buffer);
        } else if (ext === "docx") {
          const buffer = fs.readFileSync(tempFilePath);
          const result = await mammoth.extractRawText({ buffer });
          content = result.value;
        } else {
          content = fs.readFileSync(tempFilePath, "utf-8");
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
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "No content provided." });
    }

    let truncated = false;
    if (content.length > MAX_CHARS) {
      content = content.slice(0, MAX_CHARS);
      truncated = true;
    }

    const suggestions = await checkGrammar(content, selectedOptions);

    const responseObj: Record<string, unknown> = {
      suggestions,
      sourceContent: content,
    };
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
// POST /api/analyze-full
// Runs the full autonomous analysis pipeline (LangGraph).
// Returns either a complete FullReport or an interrupt payload asking the
// user to confirm the detected tone when confidence is below 70%.
// ---------------------------------------------------------------------------

app.post("/api/analyze-full", upload.single("document"), async (req, res) => {
  const tempFilePath = req.file ? req.file.path : null;

  try {
    if (!process.env.GROQ_API_KEY) {
      safeUnlink(tempFilePath);
      return res
        .status(503)
        .json({ error: "Server configuration error: GROQ_API_KEY is not set." });
    }

    const extracted = await extractContent(req, tempFilePath);
    if ("error" in extracted) {
      return res.status(extracted.status).json({ error: extracted.error });
    }

    const { content, truncated } = extracted;
    const threadId = crypto.randomUUID();
    const config = { configurable: { thread_id: threadId } };

    await compiledGraph.invoke({ text: content }, config);

    const state = await compiledGraph.getState(config);

    // Check if the graph is paused at an interrupt (tone confidence < 70)
    if (state.next.length > 0) {
      const interrupts = (state.tasks as Array<{ interrupts?: Array<{ value: unknown }> }>)
        .flatMap((t) => t.interrupts ?? []);
      const interruptData = interrupts[0]?.value as
        | { detected: DetectedTone; options: DetectedTone[] }
        | undefined;

      const response: InterruptedResponse = {
        interrupted: true,
        threadId,
        toneOptions: interruptData?.options ?? TONE_OPTIONS,
        detected: interruptData?.detected ?? "unknown",
        confidence: (state.values as { tone?: { confidence: number } }).tone?.confidence ?? 0,
      };

      return res.json({ ...response, ...(truncated ? { warning: `Document truncated to ${MAX_CHARS} characters for processing.` } : {}) });
    }

    const report = (state.values as { report?: unknown }).report;
    const responseBody: AnalyzeFullResponse & { warning?: string } = { report: report as AnalyzeFullResponse["report"] };
    if (truncated) {
      responseBody.warning = `Document truncated to ${MAX_CHARS} characters for processing.`;
    }

    return res.json(responseBody);
  } catch (error: unknown) {
    safeUnlink(tempFilePath);
    console.error("Unhandled error in /api/analyze-full:", error);
    return res.status(500).json({
      error: "Failed to run full analysis.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analyze-full-stream
// SSE streaming version of /api/analyze-full.
// Emits named events as each pipeline stage completes so the client can show
// live activity feedback.  Events: status | warning | interrupt | report | done | error
// ---------------------------------------------------------------------------

app.post("/api/analyze-full-stream", upload.single("document"), async (req, res) => {
  const tempFilePath = req.file ? req.file.path : null;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const emit = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (!process.env.GROQ_API_KEY) {
      emit("error", { message: "Server configuration error: GROQ_API_KEY is not set." });
      res.end();
      return;
    }

    const extracted = await extractContent(req, tempFilePath);
    if ("error" in extracted) {
      emit("error", { message: extracted.error });
      res.end();
      return;
    }

    const { content, truncated } = extracted;
    if (truncated) {
      emit("warning", { message: `Document truncated to ${MAX_CHARS} characters for processing.` });
    }

    const threadId = crypto.randomUUID();
    const config = { configurable: { thread_id: threadId } };

    emit("status", { stage: "start", message: "Analysis pipeline started" });

    let toneConfidence = 0;

    const graphStream = await compiledGraph.stream(
      { text: content },
      { ...config, streamMode: "updates" as const },
    );

    for await (const chunk of graphStream) {
      for (const [node, data] of Object.entries(chunk)) {
        if (node === "__interrupt__") {
          const items = data as Array<{ value: unknown }>;
          const iv = (items[0]?.value ?? {}) as { detected?: DetectedTone; options?: DetectedTone[] };
          emit("interrupt", {
            threadId,
            detected: iv.detected ?? "unknown",
            options: iv.options ?? TONE_OPTIONS,
            confidence: toneConfidence,
          });
          res.end();
          return;
        }

        const nodeData = data as Record<string, unknown>;

        if (node === "classifyAndTone") {
          const tone = nodeData.tone as { detected_tone: string; confidence: number } | undefined;
          const cls = nodeData.classification as { content_type: string } | undefined;
          toneConfidence = tone?.confidence ?? 0;
          emit("status", {
            stage: "classifyAndTone",
            message: tone
              ? `Tone: ${tone.detected_tone} (${tone.confidence}% confidence)${cls ? `  ·  Content type: ${cls.content_type}` : ""}`
              : "Tone detection and content classification complete",
          });
        } else if (node === "parallelAnalysis") {
          const grammar = nodeData.grammar as unknown[] | undefined;
          const facts = nodeData.factCheckResults as unknown[] | undefined;
          emit("status", {
            stage: "parallelAnalysis",
            message: `Grammar: ${grammar?.length ?? 0} issue(s)  ·  Fact check: ${facts?.length ?? 0} claim(s) verified via Tavily`,
            grammar_count: grammar?.length ?? 0,
            fact_check_count: facts?.length ?? 0,
          });
        } else if (node === "generateReport") {
          emit("status", { stage: "generateReport", message: "Executive summary generated" });
        }
      }
    }

    const state = await compiledGraph.getState(config);

    // Fallback: if __interrupt__ wasn't emitted in the stream but the graph
    // is still paused (state.next is non-empty), surface the interrupt now.
    if (state.next.length > 0) {
      const interrupts = (state.tasks as Array<{ interrupts?: Array<{ value: unknown }> }>)
        .flatMap((t) => t.interrupts ?? []);
      const iv = (interrupts[0]?.value ?? {}) as { detected?: DetectedTone; options?: DetectedTone[] };
      const toneState = (state.values as { tone?: { detected_tone?: DetectedTone; confidence?: number } }).tone;
      emit("interrupt", {
        threadId,
        detected: iv.detected ?? toneState?.detected_tone ?? "unknown",
        options: iv.options ?? TONE_OPTIONS,
        confidence: toneConfidence || toneState?.confidence || 0,
      });
      return;
    }

    const report = (state.values as { report?: unknown }).report;
    emit("report", { report });
    emit("done", {});
  } catch (error: unknown) {
    safeUnlink(tempFilePath);
    emit("error", { message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /api/resume-analysis
// Resumes a previously interrupted full-analysis graph thread after the user
// has selected their preferred tone. Requires threadId and tone in the body.
// ---------------------------------------------------------------------------

app.post("/api/resume-analysis", async (req, res) => {
  try {
    const { threadId, tone } = req.body as { threadId?: string; tone?: string };

    if (!threadId || !tone) {
      return res.status(400).json({ error: "threadId and tone are required." });
    }

    if (!(TONE_OPTIONS as string[]).includes(tone)) {
      return res.status(400).json({ error: `Invalid tone. Must be one of: ${TONE_OPTIONS.join(", ")}` });
    }

    const config = { configurable: { thread_id: threadId } };
    await compiledGraph.invoke(new Command({ resume: tone }), config);

    const state = await compiledGraph.getState(config);
    const report = (state.values as { report?: unknown }).report;

    if (!report) {
      return res.status(500).json({ error: "Analysis did not produce a report." });
    }

    const response: AnalyzeFullResponse = { report: report as AnalyzeFullResponse["report"] };
    return res.json(response);
  } catch (error: unknown) {
    console.error("Unhandled error in /api/resume-analysis:", error);
    return res.status(500).json({
      error: "Failed to resume analysis.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
