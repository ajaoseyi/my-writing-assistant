import { useEffect, useRef, useState } from "react";
import { LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import type { Suggestion, SuggestionType } from "../App";

// Singleton linter — initialized once, reused across renders
let linterPromise: Promise<LocalLinter> | null = null;

function getLinter(): Promise<LocalLinter> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const linter = new LocalLinter({ binary: binaryInlined });
      await linter.setup();
      return linter;
    })();
  }
  return linterPromise;
}

function lintKindToSuggestionType(kind: string): SuggestionType {
  switch (kind) {
    case "Punctuation":
    case "Formatting":
      return "punctuation";
    case "Style":
    case "Readability":
    case "Enhancement":
    case "Redundancy":
    case "Repetition":
      return "paraphrase";
    default:
      return "grammar";
  }
}

/** Runs Harper over `text` and maps every actionable lint to a Suggestion. */
async function runHarperLint(text: string): Promise<{ suggestions: Suggestion[]; count: number }> {
  const linter = await getLinter();
  const lints = await linter.lint(text, { language: "plaintext" });

  const suggestions: Suggestion[] = [];
  lints.forEach((lint, i) => {
    const sugs = lint.suggestions();
    if (sugs.length === 0) return; // no actionable fix — skip
    const span = lint.span();
    suggestions.push({
      id: `harper-${i}`,
      type: lintKindToSuggestionType(lint.lint_kind()),
      original: lint.get_problem_text(),
      replacement: sugs[0].get_replacement_text(),
      explanation: lint.message(),
      status: "pending",
      start: span.start,
      end: span.end,
    });
  });

  return { suggestions, count: lints.length };
}

/**
 * One-shot Harper lint for the analysis flow. Unlike the hook, this lints the
 * exact text passed in (so positions line up with the analyzed document) and
 * works for every input mode, including uploads. Harper is now the sole source
 * of grammar suggestions — the LLM grammar layer was removed for hallucinating.
 */
export async function lintTextWithHarper(text: string): Promise<Suggestion[]> {
  if (!text.trim()) return [];
  try {
    const { suggestions } = await runHarperLint(text);
    return suggestions;
  } catch (err) {
    console.warn("Harper lint error:", err);
    return [];
  }
}

export interface HarperLintResult {
  suggestions: Suggestion[];
  count: number;
  loading: boolean;
}

export function useHarperLint(text: string, debounceMs = 500): HarperLintResult {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!text.trim()) {
      setSuggestions([]);
      setCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(async () => {
      try {
        const { suggestions: mapped, count } = await runHarperLint(text);
        setCount(count);
        setSuggestions(mapped);
      } catch (err) {
        console.warn("Harper lint error:", err);
        setSuggestions([]);
        setCount(0);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, debounceMs]);

  return { suggestions, count, loading };
}
