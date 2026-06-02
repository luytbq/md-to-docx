// GitHub-style heading slug: lowercase, strip special chars (keep unicode letters/digits),
// spaces → '-'. Used to build heading anchors and to resolve `[text](#slug)` internal links.
export function slugify(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')        // drop inline-code backticks
    .replace(/\*\*?|__?/g, '')          // drop bold/italic markers
    .trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')  // drop special chars (keep unicode letters/digits)
    .replace(/\s+/g, '-');              // spaces → '-'
}
