import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import { parse as parseHtml } from "node-html-parser";
import natural from "natural";
import type { SeoCheckItem, SeoCheckResult, ReadabilityScores } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers — format detection
// ---------------------------------------------------------------------------

type ContentFormat = "html" | "markdown" | "text";

function detectFormat(content: string): ContentFormat {
  if (
    /<html|<!DOCTYPE/i.test(content) ||
    /<(p|h[1-6]|ul|ol|li|div|article|section)\b/i.test(content)
  ) return "html";
  if (/^#{1,6}\s/m.test(content) || /\*\*[^*]+\*\*/.test(content)) return "markdown";
  return "text";
}

// ---------------------------------------------------------------------------
// Helpers — text stripping
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^---.*?---\n/s, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toPlainText(content: string, format: ContentFormat): string {
  if (format === "html") return stripHtml(content);
  if (format === "markdown") return stripMarkdown(content);
  return content;
}

// ---------------------------------------------------------------------------
// Readability — syllable counting + formulas
// ---------------------------------------------------------------------------

function countSyllables(word: string): number {
  return estimateSyllables(word);
}

function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const matches = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function computeReadability(text: string): ReadabilityScores {
  // Split on sentence-ending punctuation
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const wordTokenizer = new natural.WordTokenizer();
  const words = wordTokenizer.tokenize(text).filter((w) => /[a-zA-Z]/.test(w));

  const sentenceCount = Math.max(sentences.length, 1);
  const wordCount = Math.max(words.length, 1);

  const syllableCounts = words.map((w) => countSyllables(w));
  const totalSyllables = syllableCounts.reduce((a, b) => a + b, 0);
  const complexWords = syllableCounts.filter((s) => s >= 3).length;

  const asl = wordCount / sentenceCount; // avg sentence length
  const asw = totalSyllables / wordCount; // avg syllables per word

  const fre = Math.max(0, Math.min(100, 206.835 - 1.015 * asl - 84.6 * asw));
  const fk = Math.max(1, Math.min(20, 0.39 * asl + 11.8 * asw - 15.59));
  const fog = Math.max(1, Math.min(20, 0.4 * (asl + 100 * (complexWords / wordCount))));
  const smogVal = sentenceCount >= 3
    ? Math.max(1, Math.min(20, 3 + Math.sqrt(complexWords * (30 / sentenceCount))))
    : fk;

  return {
    fleschReadingEase: Math.round(fre * 10) / 10,
    fleschKincaidGrade: Math.round(fk * 10) / 10,
    gunningFog: Math.round(fog * 10) / 10,
    smog: Math.round(smogVal * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Check a — heading hierarchy
// ---------------------------------------------------------------------------

function checkHeadingHierarchy(content: string, format: ContentFormat): SeoCheckItem {
  const base = { id: "heading-hierarchy", name: "Heading Hierarchy" };

  if (format === "text") {
    return { ...base, status: "skipped", message: "Heading checks require markdown or HTML formatting" };
  }

  type HeadingEntry = { level: number; text: string };
  const headings: HeadingEntry[] = [];

  if (format === "html") {
    const root = parseHtml(content);
    for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      for (const el of root.querySelectorAll(tag)) {
        headings.push({ level: parseInt(tag[1]), text: el.text.trim() });
      }
    }
    // re-sort by DOM order — node-html-parser doesn't guarantee query order
    const allHeadings = root.querySelectorAll("h1,h2,h3,h4,h5,h6");
    headings.length = 0;
    for (const el of allHeadings) {
      headings.push({ level: parseInt(el.tagName[1]), text: el.text.trim() });
    }
  } else {
    // markdown
    const lines = content.split("\n");
    for (const line of lines) {
      const m = line.match(/^(#{1,6})\s+(.*)/);
      if (m) headings.push({ level: m[1].length, text: m[2].trim() });
    }
  }

  const errors: string[] = [];

  // Empty headings
  const emptyHeadings = headings.filter((h) => h.text === "");
  if (emptyHeadings.length > 0) {
    errors.push(`${emptyHeadings.length} empty heading(s) found`);
  }

  // H1 count
  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count === 0) {
    errors.push("No H1 found — every page needs exactly one H1");
  } else if (h1Count > 1) {
    errors.push(`${h1Count} H1 tags found — there must be exactly one`);
  }

  // Level skipping
  const skips: string[] = [];
  for (let i = 1; i < headings.length; i++) {
    const diff = headings[i].level - headings[i - 1].level;
    if (diff > 1) {
      skips.push(`H${headings[i - 1].level} → H${headings[i].level}`);
    }
  }

  if (errors.length > 0) {
    return {
      ...base,
      status: "error",
      message: errors[0],
      detail: errors.length > 1 ? errors.slice(1).join("; ") : undefined,
    };
  }

  if (skips.length > 0) {
    return {
      ...base,
      status: "warning",
      message: `Heading level skipped: ${skips[0]}`,
      detail: skips.length > 1 ? `Also: ${skips.slice(1).join(", ")}` : undefined,
    };
  }

  return { ...base, status: "pass", message: `${headings.length} heading(s) correctly structured` };
}

// ---------------------------------------------------------------------------
// Check b — meta title & description length
// ---------------------------------------------------------------------------

function checkMetaTitle(metaTitle?: string): SeoCheckItem {
  const base = { id: "meta-title", name: "Meta Title" };
  if (!metaTitle || metaTitle.trim() === "") {
    return { ...base, status: "skipped", message: "No meta title provided" };
  }
  const len = [...metaTitle].length;
  if (len < 50) {
    return { ...base, status: "warning", message: `Meta title is ${len} characters — aim for 50–60`, detail: metaTitle };
  }
  if (len > 60) {
    return { ...base, status: "warning", message: `Meta title is ${len} characters — aim for 50–60`, detail: metaTitle };
  }
  return { ...base, status: "pass", message: `Meta title is ${len} characters (optimal)` };
}

function checkMetaDescription(metaDescription?: string): SeoCheckItem {
  const base = { id: "meta-description", name: "Meta Description" };
  if (!metaDescription || metaDescription.trim() === "") {
    return { ...base, status: "skipped", message: "No meta description provided" };
  }
  const len = [...metaDescription].length;
  if (len < 150) {
    return { ...base, status: "warning", message: `Meta description is ${len} characters — aim for 150–160`, detail: metaDescription };
  }
  if (len > 160) {
    return { ...base, status: "warning", message: `Meta description is ${len} characters — aim for 150–160`, detail: metaDescription };
  }
  return { ...base, status: "pass", message: `Meta description is ${len} characters (optimal)` };
}

// ---------------------------------------------------------------------------
// Check c — first paragraph word count
// ---------------------------------------------------------------------------

const BYLINE_RE = /^(by\s+\w+|published|updated|posted|date:|author:|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
const DATE_RE = /^\w+ \d{1,2},?\s+\d{4}/i;

function checkFirstParagraph(content: string, format: ContentFormat): SeoCheckItem {
  const base = { id: "first-paragraph", name: "First Paragraph Length" };

  let firstPara = "";

  if (format === "html") {
    const root = parseHtml(content);
    for (const el of root.querySelectorAll("p")) {
      const parent = el.parentNode;
      const parentTag = (parent as unknown as { tagName?: string })?.tagName?.toLowerCase();
      if (parentTag === "header" || parentTag === "figcaption" || parentTag === "time") continue;
      const text = el.text.trim();
      if (text.length > 0) { firstPara = text; break; }
    }
  } else if (format === "markdown") {
    const lines = content.split("\n");
    const blocks = content.split(/\n{2,}/);
    void lines; // used via blocks
    for (const block of blocks) {
      const trimmed = block.trim();
      if (trimmed === "") continue;
      if (/^#{1,6}\s/.test(trimmed)) continue;  // heading
      if (/^!\[/.test(trimmed)) continue;         // image
      if (/^---/.test(trimmed)) continue;         // front matter
      const firstLine = trimmed.split("\n")[0];
      if (BYLINE_RE.test(firstLine) || DATE_RE.test(firstLine)) continue;
      if (firstLine.split(/\s+/).length < 5) continue; // short byline-like line
      firstPara = trimmed.replace(/\n/g, " ").trim();
      break;
    }
  } else {
    const blocks = content.split(/\n{2,}/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (trimmed === "") continue;
      const firstLine = trimmed.split("\n")[0];
      if (BYLINE_RE.test(firstLine) || DATE_RE.test(firstLine)) continue;
      if (firstLine.split(/\s+/).length < 5) continue;
      firstPara = trimmed.replace(/\n/g, " ").trim();
      break;
    }
  }

  if (!firstPara) {
    return { ...base, status: "skipped", message: "Could not identify a first paragraph" };
  }

  const wordCount = firstPara.trim().split(/\s+/).filter(Boolean).length;

  if (wordCount > 60) {
    return {
      ...base,
      status: "warning",
      message: `First paragraph is ${wordCount} words — aim for ≤ 60 for featured snippet eligibility`,
    };
  }

  return { ...base, status: "pass", message: `First paragraph is ${wordCount} words (good)` };
}

// ---------------------------------------------------------------------------
// Check d — keyword density
// ---------------------------------------------------------------------------

function checkKeywordDensity(content: string, format: ContentFormat, focusKeyword?: string): SeoCheckItem {
  const base = { id: "keyword-density", name: "Keyword Density" };

  if (!focusKeyword || focusKeyword.trim() === "") {
    return { ...base, status: "skipped", message: "No focus keyword provided — density check skipped" };
  }

  const plainText = toPlainText(content, format).toLowerCase();
  const wordTokenizer = new natural.WordTokenizer();
  const words = wordTokenizer.tokenize(plainText).filter((w) => /[a-z]/.test(w));
  const totalWords = words.length;

  if (totalWords === 0) {
    return { ...base, status: "skipped", message: "Not enough words to compute density" };
  }

  const stemmedWords = words.map((w) => natural.PorterStemmer.stem(w));
  const keywordTokens = wordTokenizer.tokenize(focusKeyword.toLowerCase()).filter((w) => /[a-z]/.test(w));
  const stemmedKeyword = keywordTokens.map((w) => natural.PorterStemmer.stem(w));

  let occurrences = 0;
  if (stemmedKeyword.length === 1) {
    const kw = stemmedKeyword[0];
    occurrences = stemmedWords.filter((w) => w === kw).length;
  } else {
    // multi-word: look for phrase in stemmed sequence
    for (let i = 0; i <= stemmedWords.length - stemmedKeyword.length; i++) {
      if (stemmedKeyword.every((k, j) => stemmedWords[i + j] === k)) occurrences++;
    }
  }

  const density = (occurrences / totalWords) * 100;
  const densityStr = density.toFixed(2);
  const limitation = "Note: only stems counted — semantic synonyms are not detected";

  if (density < 0.5) {
    return {
      ...base,
      status: "warning",
      message: `Keyword density is ${densityStr}% — may be too sparse (aim for 0.5–2.5%)`,
      detail: limitation,
    };
  }
  if (density > 2.5) {
    return {
      ...base,
      status: "warning",
      message: `Keyword density is ${densityStr}% — risks keyword stuffing (aim for 0.5–2.5%)`,
      detail: limitation,
    };
  }

  // Paragraph-level stuffing scan — document average can mask local abuse
  const paragraphs: string[] =
    format === "html"
      ? parseHtml(content).querySelectorAll("p").map((el) => el.text)
      : toPlainText(content, format).split(/\n{2,}/);

  for (const para of paragraphs) {
    const paraWords = wordTokenizer.tokenize(para.toLowerCase()).filter((w) => /[a-z]/.test(w));
    if (paraWords.length < 20) continue;
    const stemmedPara = paraWords.map((w) => natural.PorterStemmer.stem(w));
    let paraOccurrences = 0;
    if (stemmedKeyword.length === 1) {
      paraOccurrences = stemmedPara.filter((w) => w === stemmedKeyword[0]).length;
    } else {
      for (let i = 0; i <= stemmedPara.length - stemmedKeyword.length; i++) {
        if (stemmedKeyword.every((k, j) => stemmedPara[i + j] === k)) paraOccurrences++;
      }
    }
    const localDensity = (paraOccurrences / paraWords.length) * 100;
    if (localDensity > 5) {
      const excerpt = para.trim().slice(0, 80) + (para.trim().length > 80 ? "…" : "");
      return {
        ...base,
        status: "warning",
        message: `Keyword stuffing in one paragraph (${localDensity.toFixed(1)}% — aim for 0.5–2.5% overall)`,
        detail: `"${excerpt}"`,
      };
    }
  }

  return {
    ...base,
    status: "pass",
    message: `Keyword density is ${densityStr}% (${occurrences} occurrence${occurrences !== 1 ? "s" : ""} in ${totalWords} words)`,
    detail: limitation,
  };
}

// ---------------------------------------------------------------------------
// Check e — image alt text
// ---------------------------------------------------------------------------

function checkImageAltText(content: string, format: ContentFormat): SeoCheckItem {
  const base = { id: "image-alt-text", name: "Image Alt Text" };

  if (format === "text") {
    return { ...base, status: "skipped", message: "Image checks require markdown or HTML formatting" };
  }

  let missing = 0;
  let total = 0;

  if (format === "html") {
    const root = parseHtml(content);
    for (const img of root.querySelectorAll("img")) {
      total++;
      const alt = img.getAttribute("alt");
      if (alt === null || alt === undefined || alt.trim() === "") missing++;
    }
  } else {
    // markdown: ![alt](url)
    const matches = [...content.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)];
    total = matches.length;
    missing = matches.filter((m) => m[1].trim() === "").length;
  }

  if (total === 0) {
    return { ...base, status: "pass", message: "No images found" };
  }

  if (missing > 0) {
    return {
      ...base,
      status: "error",
      message: `${missing} of ${total} image${total !== 1 ? "s" : ""} missing alt text`,
    };
  }

  return { ...base, status: "pass", message: `All ${total} image${total !== 1 ? "s" : ""} have alt text` };
}

// ---------------------------------------------------------------------------
// Check f — link presence
// ---------------------------------------------------------------------------

function checkLinkPresence(content: string, format: ContentFormat): SeoCheckItem {
  const base = { id: "link-presence", name: "Link Presence" };

  if (format === "text") {
    return { ...base, status: "skipped", message: "Link checks require markdown or HTML formatting" };
  }

  let linkCount = 0;

  if (format === "html") {
    const root = parseHtml(content);
    linkCount = root.querySelectorAll("a[href]").length;
  } else {
    const matches = content.match(/\[([^\]]+)\]\([^)]+\)/g);
    linkCount = matches ? matches.length : 0;
  }

  if (linkCount === 0) {
    return { ...base, status: "warning", message: "No links found — consider adding relevant internal or external links" };
  }

  return { ...base, status: "pass", message: `${linkCount} link${linkCount !== 1 ? "s" : ""} found` };
}

// ---------------------------------------------------------------------------
// LLM phase — plain-English summary + additional insights
// ---------------------------------------------------------------------------

const LlmOutputSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
});

async function getLlmInsights(
  content: string,
  checks: SeoCheckItem[],
  readability: ReadabilityScores,
  focusKeyword?: string,
): Promise<{ summary: string; recommendations: string[] }> {
  const model = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    apiKey: process.env.GROQ_API_KEY,
  });

  const checkSummary = checks
    .map((c) => `- [${c.status.toUpperCase()}] ${c.name}: ${c.message}`)
    .join("\n");

  const readabilitySummary =
    `Flesch Reading Ease: ${readability.fleschReadingEase} | ` +
    `Flesch-Kincaid Grade: ${readability.fleschKincaidGrade} | ` +
    `Gunning Fog: ${readability.gunningFog} | ` +
    `SMOG: ${readability.smog}`;

  const excerpt = content.replace(/<[^>]+>/g, " ").slice(0, 2500);

  const prompt = `You are an SEO advisor. A rule-based system has already run structural checks on a piece of content. Your job is to:
1. Write a clear 3-4 sentence plain-English summary of the overall SEO health based on the check results and readability.
2. Return a list of actionable, friendly recommendations. For each failed or warned check, translate it into plain language. Also add 2-3 additional insights that the structural rules CANNOT detect, such as: semantic keyword synonym coverage, content intent alignment, content depth relative to likely search intent, and call-to-action clarity.
3. Do NOT suggest rewriting the content. Surface observations only.

Rule-based check results:
${checkSummary}

Readability scores:
${readabilitySummary}

Focus keyword: ${focusKeyword || "not provided"}

Content excerpt (first 2500 chars):
${excerpt}

Respond ONLY with valid JSON matching this schema:
{
  "summary": "string",
  "recommendations": ["string", ...]
}`;

  try {
    const response = await model.invoke(prompt);
    const raw = response.content as string;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = LlmOutputSchema.parse(JSON.parse(jsonMatch[0]));
    return parsed;
  } catch {
    return {
      summary: "SEO analysis complete. Review the check results below for specific issues found.",
      recommendations: checks
        .filter((c) => c.status === "error" || c.status === "warning")
        .map((c) => c.message),
    };
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface SeoCheckOptions {
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
}

export async function seoCheck(
  content: string,
  options: SeoCheckOptions = {},
): Promise<SeoCheckResult> {
  const format = detectFormat(content);

  const checks: SeoCheckItem[] = [
    checkHeadingHierarchy(content, format),
    checkMetaTitle(options.metaTitle),
    checkMetaDescription(options.metaDescription),
    checkFirstParagraph(content, format),
    checkKeywordDensity(content, format, options.focusKeyword),
    checkImageAltText(content, format),
    checkLinkPresence(content, format),
  ];

  const plainText = toPlainText(content, format);
  const readability = computeReadability(plainText);

  const { summary, recommendations } = await getLlmInsights(
    content,
    checks,
    readability,
    options.focusKeyword,
  );

  return { checks, readability, llmSummary: summary, llmRecommendations: recommendations };
}
