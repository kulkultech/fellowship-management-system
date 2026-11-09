import { describe, expect, it } from 'vitest';
import { markdownPreview } from './markdownPreview';

describe('markdownPreview', () => {
  it('keeps short content whole', () => {
    expect(markdownPreview('# Hi\n\nShort.', 100)).toBe('# Hi\n\nShort.');
  });

  it('cuts long content at a blank line', () => {
    const md = Array.from({ length: 50 }, (_, i) => `Paragraph ${i} with some words.`).join('\n\n');
    const preview = markdownPreview(md, 200);
    expect(preview.length).toBeLessThan(300);
    expect(md.startsWith(preview)).toBe(true);
    expect(preview.endsWith('words.')).toBe(true);
  });

  it('never leaves a code block open', () => {
    const md = 'Intro\n\n````markua-quiz\n' + '? Question\n\na) one\nB) two\n\n'.repeat(40) + '````\n\nAfter';
    const preview = markdownPreview(md, 50);
    expect(preview).not.toBe(md);
    expect(preview.match(/^````/gm)).toHaveLength(2);
  });
});
