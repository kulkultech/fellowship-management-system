const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * The start of long Markdown for a folded module: about `chars` characters, cut at a blank line and
 * never inside a code block. A whole book chapter (quizzes included) is only rendered once opened.
 */
export function markdownPreview(markdown: string, chars = 1500): string {
  if (markdown.length <= chars * 2) return markdown;
  const out: string[] = [];
  let size = 0;
  let fence = '';
  for (const line of markdown.split('\n')) {
    if (!fence && size >= chars && line.trim() === '') break;
    if (size > chars * 3) break;
    out.push(line);
    size += line.length + 1;
    const f = line.match(FENCE_RE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim().replace(/[`~]/g, '') === '') fence = '';
    } else if (f) {
      fence = f[1];
    }
  }
  if (fence) out.push(fence);
  return out.join('\n');
}
