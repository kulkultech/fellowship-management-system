import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent } from './MarkdownContent';

const render = (md: string) => renderToStaticMarkup(<MarkdownContent>{md}</MarkdownContent>);

describe('MarkdownContent', () => {
  it('renders headings, lists, code and tables', () => {
    const html = render('## Week 1\n- one\n- two\n\n`x`\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<h2>Week 1</h2>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code>x</code>');
    expect(html).toContain('<table>');
  });

  it('keeps single line breaks from plain-text modules', () => {
    expect(render('line one\nline two')).toContain('<br/>');
  });

  it('opens links in a new tab', () => {
    expect(render('[docs](https://example.com)')).toContain('target="_blank" rel="noopener noreferrer"');
  });

  it('never runs HTML or scripts typed into the content', () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
  });
});
