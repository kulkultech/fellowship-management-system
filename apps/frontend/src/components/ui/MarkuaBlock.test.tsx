import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkuaBlock } from './MarkuaBlock';
import { MarkdownContent } from './MarkdownContent';

describe('parseMarkuaBlock', () => {
  it('reads questions, choices (capital letter = correct) and answers', () => {
    const { intro, questions } = parseMarkuaBlock(
      [
        '## Java Operators',
        '',
        '? What prints?',
        '```java',
        '? not a question',
        'a) not a choice',
        '```',
        '',
        'a) 11',
        'B) 12',
        '',
        '? Explain operators.',
        '- in a list',
        '',
        '! They combine values.',
        'More detail.',
      ].join('\n'),
    );
    expect(intro).toBe('## Java Operators');
    expect(questions).toHaveLength(2);
    expect(questions[0].prompt).toContain('? not a question');
    expect(questions[0].prompt).toContain('a) not a choice');
    expect(questions[0].choices).toEqual([
      { text: '11', correct: false },
      { text: '12', correct: true },
    ]);
    expect(questions[1].prompt).toBe('Explain operators.\n- in a list');
    expect(questions[1].choices).toHaveLength(0);
    expect(questions[1].answer).toBe('They combine values.\nMore detail.');
  });
});

describe('MarkdownContent with an imported book', () => {
  const render = (md: string) => renderToStaticMarkup(<MarkdownContent>{md}</MarkdownContent>);

  it('shows markua-quiz blocks as a quiz instead of code', () => {
    const html = render('Intro\n\n````markua-quiz\n? Pick one\n\na) no\nB) yes\n````');
    expect(html).toContain('Quiz');
    expect(html).toContain('type="radio"');
    expect(html).not.toContain('<pre');
  });

  it('keeps links to other modules on the page', () => {
    const html = render('[the intro](#item-123)');
    expect(html).toContain('href="#item-123"');
    expect(html).not.toContain('target="_blank"');
  });
});
