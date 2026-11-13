import type { Monaco } from '@monaco-editor/react';

export interface CodeSnippet {
  prefix: string;
  description: string;
  body: string;
}

/**
 * IntelliJ-style shortcuts for Java: type the prefix, then press Tab or Enter.
 * `$1`, `${1:name}` are the stops Tab moves through; `$0` is where the cursor ends.
 */
export const JAVA_SNIPPETS: CodeSnippet[] = [
  { prefix: 'sout', description: 'System.out.println', body: 'System.out.println($0);' },
  { prefix: 'souf', description: 'System.out.printf', body: 'System.out.printf("$1%n"$0);' },
  { prefix: 'serr', description: 'System.err.println', body: 'System.err.println($0);' },
  { prefix: 'psvm', description: 'main method', body: 'public static void main(String[] args) {\n\t$0\n}' },
  { prefix: 'main', description: 'main method', body: 'public static void main(String[] args) {\n\t$0\n}' },
  { prefix: 'fori', description: 'for loop with an index', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}' },
  { prefix: 'iter', description: 'for-each loop', body: 'for (${1:String} ${2:item} : ${3:items}) {\n\t$0\n}' },
];

interface EditorModel {
  getWordUntilPosition(position: CursorPosition): { startColumn: number; endColumn: number };
}

interface CursorPosition {
  lineNumber: number;
  column: number;
}

const registered = new WeakSet<object>();

/** Adds the Java shortcuts to Monaco's suggestions. Monaco is shared by every editor, so this runs once. */
export function registerJavaSnippets(monaco: Monaco): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);

  monaco.languages.registerCompletionItemProvider('java', {
    provideCompletionItems(model: EditorModel, position: CursorPosition) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: JAVA_SNIPPETS.map((snippet) => ({
          label: snippet.prefix,
          detail: snippet.description,
          documentation: snippet.body.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d/g, ''),
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
      };
    },
  });
}
