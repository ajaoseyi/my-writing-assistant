import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getClientId() { return process.env.GOOGLE_CLIENT_ID || ""; }
function getClientSecret() { return process.env.GOOGLE_CLIENT_SECRET || ""; }
function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/gdocs/callback";
}

// Full `drive` scope is required to WRITE back to documents the user imported or
// searched for (not just ones this app created). `drive.file` alone only grants
// write access to app-created/Picker-opened files, which causes a 403 when the
// "Fix"/"Fix all" flow uploads HTML via the Drive API to an externally-created doc.
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

// Use googleapis' own bundled OAuth2 to avoid the dual-package type conflict
const OAuth2 = google.auth.OAuth2;
export type AuthClient = InstanceType<typeof OAuth2>;

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

// Token file sits at server/.gdocs-tokens.json (two levels up from src/gdocs/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.resolve(__dirname, "../../.gdocs-tokens.json");

// Multi-user token store keyed by session ID (x-gdocs-session header)
const tokenStore = new Map<string, StoredTokens>();

function loadTokens(): void {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return;
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, StoredTokens>;
    for (const [sid, tokens] of Object.entries(parsed)) {
      tokenStore.set(sid, tokens);
    }
  } catch {
    // Corrupted file — start fresh
  }
}

function saveTokens(): void {
  try {
    const obj: Record<string, StoredTokens> = {};
    for (const [sid, tokens] of tokenStore.entries()) {
      obj[sid] = tokens;
    }
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch {
    // Non-fatal — next restart will re-auth
  }
}

// Load persisted tokens on module init
loadTokens();

function makeClient(): AuthClient {
  return new OAuth2(getClientId(), getClientSecret(), getRedirectUri());
}

export function isConfigured(): boolean {
  return Boolean(getClientId() && getClientSecret());
}

export function getAuthUrl(): string {
  return makeClient().generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCode(sessionId: string, code: string): Promise<void> {
  const client = makeClient();
  const { tokens } = await client.getToken(code);
  tokenStore.set(sessionId, {
    access_token: tokens.access_token ?? "",
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  });
  saveTokens();
}

export function getAuthClient(sessionId: string): AuthClient {
  const stored = tokenStore.get(sessionId);
  if (!stored) throw new Error("Not authorized. Connect your Google account first.");
  const client = makeClient();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date,
  });
  // Automatically persist refreshed tokens
  client.on("tokens", (tokens) => {
    tokenStore.set(sessionId, {
      access_token: tokens.access_token ?? stored.access_token,
      refresh_token: tokens.refresh_token ?? stored.refresh_token,
      expiry_date: tokens.expiry_date ?? stored.expiry_date,
    });
    saveTokens();
  });
  return client;
}

export function isAuthorized(sessionId: string): boolean {
  return tokenStore.has(sessionId);
}

export function clearAuth(sessionId: string): void {
  tokenStore.delete(sessionId);
  saveTokens();
}
