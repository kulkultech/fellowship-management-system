import { describe, it, expect, vi } from 'vitest';
import type { Monaco } from '@monaco-editor/react';
import { JAVA_SNIPPETS, registerJavaSnippets } from './javaSnippets';

function fakeMonaco() {
  const register = vi.fn();
  const monaco = {
    languages: {
      registerCompletionItemProvider: register,
      CompletionItemKind: { Snippet: 27 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
  } as unknown as Monaco;
  return { monaco, register };
}

describe('Java shortcuts', () => {
  it('include the IntelliJ shortcuts fellows learn', () => {
    const prefixes = JAVA_SNIPPETS.map((s) => s.prefix);
    expect(prefixes).toEqual(expect.arrayContaining(['sout', 'souf', 'serr', 'psvm', 'fori', 'iter']));
    expect(JAVA_SNIPPETS.find((s) => s.prefix === 'sout')?.body).toBe('System.out.println($0);');
  });

  it('register once per Monaco instance, for Java only', () => {
    const { monaco, register } = fakeMonaco();
    registerJavaSnippets(monaco);
    registerJavaSnippets(monaco);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toBe('java');
  });

  it('suggest snippets that replace the typed word', () => {
    const { monaco, register } = fakeMonaco();
    registerJavaSnippets(monaco);
    const provider = register.mock.calls[0][1];
    const model = { getWordUntilPosition: () => ({ word: 'sou', startColumn: 9, endColumn: 12 }) };
    const { suggestions } = provider.provideCompletionItems(model, { lineNumber: 4, column: 12 });

    const sout = suggestions.find((s: { label: string }) => s.label === 'sout');
    expect(sout.insertText).toBe('System.out.println($0);');
    expect(sout.insertTextRules).toBe(4);
    expect(sout.kind).toBe(27);
    expect(sout.range).toEqual({ startLineNumber: 4, endLineNumber: 4, startColumn: 9, endColumn: 12 });

    const fori = suggestions.find((s: { label: string }) => s.label === 'fori');
    expect(fori.documentation).toBe('for (int i = 0; i < n; i++) {\n\t\n}');
  });
});
