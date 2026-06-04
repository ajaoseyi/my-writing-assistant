import type { MatchedSource, PlagiarismResult, PlagiarismVerdict } from "../types.js";

const COPYLEAKS_AUTH_URL = "https://id.copyleaks.com/v3/account/login/api";
const COPYLEAKS_API_BASE = "https://api.copyleaks.com/v3/businesses";

const FALLBACK: PlagiarismResult = {
  score: 0,
  matched_sources: [],
  verdict: "original",
};

async function getCopyleaksToken(): Promise<string> {
  const resp = await fetch(COPYLEAKS_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.COPYLEAKS_EMAIL,
      key: process.env.COPYLEAKS_API_KEY,
    }),
  });
  if (!resp.ok) throw new Error(`Copyleaks auth failed: ${resp.status}`);
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

function scoreToVerdict(score: number): PlagiarismVerdict {
  if (score < 10) return "original";
  if (score < 30) return "partial";
  return "plagiarised";
}

/**
 * Submits the given text to the Copyleaks API for plagiarism detection.
 * Polls for results up to 10 times (30-second window). Falls back gracefully
 * when credentials are missing or the API is unavailable — never throws.
 * @param text - The document text to check for plagiarism.
 * @returns Plagiarism result with score (0–100), matched sources, and verdict.
 */
export async function plagiarismCheck(text: string): Promise<PlagiarismResult> {
  if (!process.env.COPYLEAKS_EMAIL || !process.env.COPYLEAKS_API_KEY) {
    console.warn(
      "plagiarismCheck: COPYLEAKS_EMAIL / COPYLEAKS_API_KEY not set — skipping",
    );
    return FALLBACK;
  }

  try {
    const token = await getCopyleaksToken();
    const scanId = crypto.randomUUID();

    // Submit scan
    const base64Text = Buffer.from(text, "utf-8").toString("base64");
    const submitResp = await fetch(
      `${COPYLEAKS_API_BASE}/submit/file/${scanId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          base64: base64Text,
          filename: "document.txt",
          properties: {
            sandbox: true,
            scanning: { copyleaks: true, internet: true },
          },
        }),
      },
    );

    if (!submitResp.ok) {
      console.warn(
        `plagiarismCheck: submit failed (${submitResp.status}) — returning fallback`,
      );
      return FALLBACK;
    }

    // Poll for results (10 retries × 3 s = 30 s max)
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const resultsResp = await fetch(`${COPYLEAKS_API_BASE}/${scanId}/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resultsResp.ok) continue;

      const data = (await resultsResp.json()) as {
        status?: string;
        scannedDocument?: { totalWords?: number; totalExcluded?: number };
        results?: {
          internet?: Array<{
            url: string;
            title: string;
            matchedWords: number;
            similarityPercent: number;
          }>;
          score?: { aggregatedScore: number };
        };
      };

      if (data.status !== "Finished") continue;

      const score = data.results?.score?.aggregatedScore ?? 0;
      const matched_sources: MatchedSource[] = (
        data.results?.internet ?? []
      ).map((src) => ({
        url: src.url,
        title: src.title,
        matched_words: src.matchedWords,
        similarity_percentage: src.similarityPercent,
      }));

      return { score, matched_sources, verdict: scoreToVerdict(score) };
    }

    console.warn("plagiarismCheck: timed out waiting for results — returning fallback");
    return FALLBACK;
  } catch (err: unknown) {
    console.warn(
      "plagiarismCheck: error —",
      err instanceof Error ? err.message : String(err),
    );
    return FALLBACK;
  }
}
