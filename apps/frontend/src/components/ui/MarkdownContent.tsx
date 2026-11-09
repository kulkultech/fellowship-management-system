import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { MarkuaBlock } from './MarkuaBlock';

interface MarkdownContentProps {
  children: string;
  className?: string;
}

const MARKUA_BLOCKS: Record<string, 'quiz' | 'exercise'> = {
  'language-markua-quiz': 'quiz',
  'language-markua-exercise': 'exercise',
};

type HastNode = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] };
const textOf = (node: HastNode): string => (node.value ?? '') + (node.children || []).map(textOf).join('');

const components: Components = {
  a: ({ node: _node, href, ...props }) => {
    // A link to another module on this page (from an imported book) scrolls there
    if (href?.startsWith('#')) {
      return (
        <a
          {...props}
          href={href}
          onClick={(e) => {
            const target = document.getElementById(decodeURIComponent(href.slice(1)));
            if (target) {
              e.preventDefault();
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
        />
      );
    }
    return <a {...props} href={href} target="_blank" rel="noopener noreferrer" />;
  },
  // Quizzes and exercises from an imported Markua book arrive as markua-quiz / markua-exercise code blocks
  pre: ({ node, children, ...props }) => {
    const code = (node as HastNode | undefined)?.children?.[0];
    const classes = code?.tagName === 'code' ? code.properties?.className : undefined;
    const kind = Array.isArray(classes) ? classes.map(String).map((c) => MARKUA_BLOCKS[c]).find(Boolean) : undefined;
    if (code && kind) {
      return <MarkuaBlock kind={kind} source={textOf(code).replace(/\n$/, '')} renderMarkdown={(md) => <MarkdownContent>{md}</MarkdownContent>} />;
    }
    return <pre {...props}>{children}</pre>;
  },
};

/**
 * Renders Markdown (with GitHub tables, task lists and strikethrough) as styled text. A single line
 * break stays a line break, so content written as plain text keeps its layout.
 * Raw HTML in the source is shown as text, never run, so content from mentors is safe to display.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ children, className = '' }) => (
  <div className={`markdown-body ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
      {children}
    </ReactMarkdown>
  </div>
);
