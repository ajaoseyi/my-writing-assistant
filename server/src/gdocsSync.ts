import type { Server as SocketIOServer } from "socket.io";
import { readDocContent } from "./gdocs/googleApi.js";
import { getAuthClient } from "./gdocs/googleAuth.js";

type WatchKey = string; // `${sessionId}:${docId}`

const timers = new Map<WatchKey, ReturnType<typeof setInterval>>();
const lastContent = new Map<WatchKey, string>();

function normalizeHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function updateLastContent(sessionId: string, docId: string, html: string): void {
  const key: WatchKey = `${sessionId}:${docId}`;
  lastContent.set(key, normalizeHtml(html));
}

export function stopPolling(sessionId: string, docId: string): void {
  const key: WatchKey = `${sessionId}:${docId}`;
  const timer = timers.get(key);
  if (timer !== undefined) {
    clearInterval(timer);
    timers.delete(key);
  }
  lastContent.delete(key);
}

export function startPolling(sessionId: string, docId: string, io: SocketIOServer): void {
  const key: WatchKey = `${sessionId}:${docId}`;

  // Clear any existing timer for this key (handles reconnect)
  const existing = timers.get(key);
  if (existing !== undefined) clearInterval(existing);

  // Seed lastContent immediately so the first real poll doesn't emit a false change
  (async () => {
    try {
      const auth = getAuthClient(sessionId);
      const { content } = await readDocContent(docId, auth);
      lastContent.set(key, normalizeHtml(content));
    } catch {
      lastContent.set(key, "");
    }
  })();

  const timer = setInterval(async () => {
    try {
      const auth = getAuthClient(sessionId);
      const { content, title } = await readDocContent(docId, auth);
      const normalized = normalizeHtml(content);
      const prev = lastContent.get(key) ?? "";
      if (normalized !== prev) {
        lastContent.set(key, normalized);
        io.to(`session:${sessionId}`).emit("gdocs:external-change", { docId, html: content, title });
      }
    } catch (err) {
      io.to(`session:${sessionId}`).emit("gdocs:error", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, 10_000);

  timers.set(key, timer);
}
