import { Router } from "express";
import type { Request, Response } from "express";
import {
  getAuthUrl,
  exchangeCode,
  getAuthClient,
  isAuthorized,
  clearAuth,
  isConfigured,
} from "../gdocs/googleAuth.js";
import {
  readDocContent,
  listDriveFiles,
  createDocFromContent,
  updateDocContent,
} from "../gdocs/googleApi.js";
import { updateLastContent } from "../gdocsSync.js";

const router = Router();

const APP_URL = process.env.APP_URL || "http://localhost:3000";

function sessionId(req: Request): string {
  return (req.headers["x-gdocs-session"] as string) || "";
}

// GET /api/gdocs/status
router.get("/status", (req: Request, res: Response) => {
  if (!isConfigured()) return res.json({ connected: false, configured: false });
  return res.json({ connected: isAuthorized(sessionId(req)), configured: true });
});

// GET /api/gdocs/auth-url  — returns the Google consent URL for the client to open
router.get("/auth-url", (_req: Request, res: Response) => {
  if (!isConfigured())
    return res.status(503).json({ error: "Google Docs integration not configured." });
  return res.json({ url: getAuthUrl() });
});

// GET /api/gdocs/callback  — Google redirects here after user grants consent
router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query["code"] as string | undefined;
  if (!code) return res.redirect(`${APP_URL}/?gdocs=error`);

  try {
    const sid = crypto.randomUUID();
    await exchangeCode(sid, code);
    // Pass session ID back to the frontend via query param; frontend stores it in localStorage
    return res.redirect(`${APP_URL}/?gdocs=connected&session=${sid}`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return res.redirect(`${APP_URL}/?gdocs=error`);
  }
});

// POST /api/gdocs/disconnect
router.post("/disconnect", (req: Request, res: Response) => {
  clearAuth(sessionId(req));
  return res.json({ ok: true });
});

// POST /api/gdocs/import  — fetch a Google Doc's text by file ID
router.post("/import", async (req: Request, res: Response) => {
  const sid = sessionId(req);
  if (!isAuthorized(sid))
    return res.status(401).json({ error: "Not connected to Google. Please connect first." });

  const { fileId } = req.body as { fileId?: string };
  if (!fileId) return res.status(422).json({ error: "fileId is required." });

  try {
    const auth = getAuthClient(sid);
    const { content, title } = await readDocContent(fileId, auth);
    return res.json({ content, title, docId: fileId });
  } catch (err) {
    console.error("Google Docs import error:", err);
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "Failed to import document." });
  }
});

// GET /api/gdocs/search  — list/search Google Docs in Drive
router.get("/search", async (req: Request, res: Response) => {
  const sid = sessionId(req);
  if (!isAuthorized(sid))
    return res.status(401).json({ error: "Not connected to Google." });

  const q = (req.query["q"] as string) || "";

  try {
    const auth = getAuthClient(sid);
    const files = await listDriveFiles(q, auth);
    return res.json({ files });
  } catch (err) {
    console.error("Google Drive search error:", err);
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "Failed to search Drive." });
  }
});

// POST /api/gdocs/create-doc  — create a new Google Doc from the current content
router.post("/create-doc", async (req: Request, res: Response) => {
  const sid = sessionId(req);
  if (!isAuthorized(sid))
    return res.status(401).json({ error: "Not connected to Google." });

  const { content = "", title = "New Document" } = req.body as {
    content?: string;
    title?: string;
  };

  try {
    const auth = getAuthClient(sid);
    const { docId, docUrl } = await createDocFromContent(title, content, auth);
    return res.json({ docId, docUrl });
  } catch (err) {
    console.error("Google Docs create error:", err);
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "Failed to create document." });
  }
});

// POST /api/gdocs/update-doc  — overwrite a Google Doc's text content
router.post("/update-doc", async (req: Request, res: Response) => {
  const sid = sessionId(req);
  if (!isAuthorized(sid))
    return res.status(401).json({ error: "Not connected to Google. Please connect first." });

  const { docId, content = "" } = req.body as { docId?: string; content?: string };
  if (!docId) return res.status(422).json({ error: "docId is required." });

  try {
    const auth = getAuthClient(sid);
    await updateDocContent(docId, content, auth);
    updateLastContent(sid, docId, content);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Google Docs update error:", err);
    // A 403 here usually means the connected Google session was authorized under
    // the old read-only scope. Tell the client to reconnect rather than masking it
    // behind a generic 502.
    const status = (err as { code?: number; status?: number })?.code
      ?? (err as { status?: number })?.status;
    if (status === 403) {
      return res.status(403).json({
        error:
          "No write access to this document. Please disconnect and reconnect your Google account to grant edit permission, then try again.",
        needsReauth: true,
      });
    }
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "Failed to update document." });
  }
});

export default router;
