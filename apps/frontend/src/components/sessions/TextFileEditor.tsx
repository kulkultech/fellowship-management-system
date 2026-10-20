import React, { useEffect, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as Y from 'yjs';
import { Copy, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { bindMonacoToYText } from './collab';

/** A shared notes file (.txt, .md): everyone edits the same text live. */
export const TextFileEditor: React.FC<{ ydoc: Y.Doc; textKey: string; fileName: string }> = ({ ydoc, textKey, fileName }) => {
  const [editor, setEditor] = useState<any>(null);
  const handleMount: OnMount = (instance) => setEditor(instance);

  useEffect(() => {
    if (!editor) return;
    return bindMonacoToYText(editor, ydoc.getText(textKey));
  }, [editor, ydoc, textKey]);

  const content = () => ydoc.getText(textKey).toString();

  return (
    <div className="bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-1.5 border-b border-slate-100">
        <span className="meta-text">Shared notes · everyone in the session can edit</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(content());
              toast.success('Copied');
            }}
            className="btn btn-sm btn-ghost"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([content()], { type: 'text/plain;charset=utf-8' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = fileName;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="btn btn-sm btn-ghost"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>
      <div className="h-[680px]">
        <Editor
          language={fileName.toLowerCase().endsWith('.md') ? 'markdown' : 'plaintext'}
          defaultValue=""
          onMount={handleMount}
          theme="light"
          options={{
            wordWrap: 'on',
            minimap: { enabled: false },
            lineNumbers: 'off',
            fontSize: 14,
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            folding: false,
          }}
        />
      </div>
    </div>
  );
};
