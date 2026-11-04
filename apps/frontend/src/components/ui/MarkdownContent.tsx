import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface MarkdownContentProps {
  children: string;
  className?: string;
}

/**
 * Renders Markdown (with GitHub tables, task lists and strikethrough) as styled text. A single line
 * break stays a line break, so content written as plain text keeps its layout.
 * Raw HTML in the source is shown as text, never run, so content from mentors is safe to display.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ children, className = '' }) => (
  <div className={`markdown-body ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      }}
    >
      {children}
    </ReactMarkdown>
  </div>
);
