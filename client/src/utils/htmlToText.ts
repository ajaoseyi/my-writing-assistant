export function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  // textContent concatenates block elements with no separator, so a heading
  // ending in "Feedback" followed by a paragraph starting with "For" collapses
  // into the fabricated word "FeedbackFor". Worse, with no boundary at all a
  // heading or list item bleeds into the next block and the two get analyzed as
  // one sentence (e.g. "1. Opportunity Overview" merged into the paragraph below
  // it). So append a NEWLINE after each block-level element (and <br>) and keep
  // newlines in the output — downstream sentence detection treats them as hard
  // boundaries, while spaces/tabs are still collapsed.
  div
    .querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, br, tr")
    .forEach((el) => el.appendChild(document.createTextNode("\n")));
  return (div.textContent || "")
    .replace(/[ \t]+/g, " ")   // collapse horizontal whitespace
    .replace(/ *\n */g, "\n")  // trim spaces around newlines
    .replace(/\n{2,}/g, "\n")  // collapse blank lines to a single break
    .trim();
}
