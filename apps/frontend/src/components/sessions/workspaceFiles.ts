import * as Y from 'yjs';
import { LANGUAGE_SNIPPET_COLLECTIONS, LEGACY_LANGUAGE_IDS, SUPPORTED_LANGUAGES, SupportedLanguage } from './LiveCodeEditor';
import { LOCAL_ORIGIN, NOTES_TEXT_KEY, codeTextKey } from './collab';

// The workspace is a set of files in the shared document. A file's extension decides how it opens:
// .txt/.md are notes, code extensions open the code editor, .excalidraw opens a whiteboard.

export const FILES_MAP = 'files';
export const MAIN_BOARD_KEY = 'board:main';

export interface WorkspaceFile {
  id: string;
  name: string;
  /** Y.Text key for notes and code, Y.Map key for whiteboards */
  key: string;
  created: number;
}

export type FileKind = { kind: 'notes' } | { kind: 'code'; language: SupportedLanguage } | { kind: 'board' };

// Every code language opens by its extensions (e.g. .py, .go, .rs, .cpp)
const CODE_EXTENSIONS: Record<string, SupportedLanguage> = Object.fromEntries(
  SUPPORTED_LANGUAGES.flatMap((l) => [l.extension, ...(l.extensions || [])].map((ext) => [ext.slice(1), l.id]))
);

export const extensionOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

export const fileKind = (name: string): FileKind => {
  const ext = extensionOf(name);
  if (ext === 'excalidraw') return { kind: 'board' };
  if (CODE_EXTENSIONS[ext]) return { kind: 'code', language: CODE_EXTENSIONS[ext] };
  return { kind: 'notes' };
};

export const SUPPORTED_EXTENSIONS_HINT =
  '.txt or .md for notes, .excalidraw for a whiteboard, or any code file (.py, .js, .java, .go, .rs, .c, .cpp, .rb, .php, .sql…)';

/** Checks a file name; returns an error message or null. */
export const validateFileName = (name: string, files: WorkspaceFile[], exceptId?: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a file name';
  if (trimmed.length > 60) return 'File name is too long';
  if (/[\\/]/.test(trimmed)) return 'File names cannot contain slashes';
  if (!extensionOf(trimmed)) return 'Add an extension, e.g. notes.txt, main.py or board.excalidraw';
  if (files.some((f) => f.id !== exceptId && f.name.toLowerCase() === trimmed.toLowerCase())) {
    return 'A file with this name already exists';
  }
  return null;
};

export const listFiles = (doc: Y.Doc): WorkspaceFile[] => {
  const map = doc.getMap<WorkspaceFile>(FILES_MAP);
  return Array.from(map.values()).sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
};

export const addFile = (doc: Y.Doc, name: string): WorkspaceFile => {
  const id = crypto.randomUUID();
  const file: WorkspaceFile = {
    id,
    name: name.trim(),
    key: fileKind(name).kind === 'board' ? `board:${id}` : `file:${id}`,
    created: Date.now(),
  };
  const kind = fileKind(name);
  doc.transact(() => {
    doc.getMap<WorkspaceFile>(FILES_MAP).set(id, file);
    // A new code file starts from its language's starter program
    if (kind.kind === 'code') {
      const starter = LANGUAGE_SNIPPET_COLLECTIONS[kind.language]?.[0]?.code;
      if (starter) doc.getText(file.key).insert(0, starter);
    }
  }, LOCAL_ORIGIN);
  return file;
};

/** Renames a file; a whiteboard cannot become a text file or the other way round. */
export const renameFile = (doc: Y.Doc, file: WorkspaceFile, name: string): string | null => {
  const wasBoard = fileKind(file.name).kind === 'board';
  const isBoard = fileKind(name).kind === 'board';
  if (wasBoard !== isBoard) {
    return wasBoard ? 'A whiteboard must keep the .excalidraw extension' : 'A text file cannot become a whiteboard';
  }
  doc.transact(() => doc.getMap<WorkspaceFile>(FILES_MAP).set(file.id, { ...file, name: name.trim() }), LOCAL_ORIGIN);
  return null;
};

/** Removes a file from the list. Its content stays in the document, so nothing is lost by accident. */
export const removeFile = (doc: Y.Doc, file: WorkspaceFile) => {
  doc.transact(() => doc.getMap<WorkspaceFile>(FILES_MAP).delete(file.id), LOCAL_ORIGIN);
};

/**
 * Creates the starting files when a workspace has none: notes.txt, the code written before files
 * existed (main.<ext> for each language that was changed, or main.py), and whiteboard.excalidraw.
 * Ids are fixed, so browsers doing this at the same time end up with the same list.
 */
export const ensureDefaultFiles = (doc: Y.Doc) => {
  const map = doc.getMap<WorkspaceFile>(FILES_MAP);
  if (map.size > 0) return;
  const files: WorkspaceFile[] = [{ id: 'notes', name: 'notes.txt', key: NOTES_TEXT_KEY, created: 1 }];
  SUPPORTED_LANGUAGES.filter((l) => LEGACY_LANGUAGE_IDS.includes(l.id)).forEach((lang, i) => {
    const text = doc.getText(codeTextKey(lang.id)).toString().trim();
    const starter = (LANGUAGE_SNIPPET_COLLECTIONS[lang.id][0]?.code || '').trim();
    if (text && text !== starter) {
      files.push({ id: `code-${lang.id}`, name: `main${lang.extension}`, key: codeTextKey(lang.id), created: 2 + i });
    }
  });
  if (files.length === 1) {
    files.push({ id: 'code-python', name: 'main.py', key: codeTextKey('python'), created: 2 });
  }
  files.push({ id: 'whiteboard', name: 'whiteboard.excalidraw', key: MAIN_BOARD_KEY, created: 20 });
  doc.transact(() => files.forEach((f) => map.set(f.id, f)), 'seed');
};

/** Keeps the newest version of each whiteboard element (Excalidraw's reconcile rule). */
export const writeBoardElements = (doc: Y.Doc, key: string, elements: any[], origin: unknown = LOCAL_ORIGIN) => {
  const board = doc.getMap<any>(key);
  doc.transact(() => {
    for (const el of elements) {
      if (!el?.id) continue;
      const existing = board.get(el.id);
      if (
        !existing ||
        el.version > existing.version ||
        (el.version === existing.version && el.versionNonce < existing.versionNonce)
      ) {
        board.set(el.id, JSON.parse(JSON.stringify(el)));
      }
    }
  }, origin);
};
