import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { NOTES_TEXT_KEY, codeTextKey } from './collab';
import {
  MAIN_BOARD_KEY,
  addFile,
  ensureDefaultFiles,
  fileKind,
  listFiles,
  removeFile,
  renameFile,
  validateFileName,
  writeBoardElements,
} from './workspaceFiles';

describe('workspace files', () => {
  it('opens a file by its extension', () => {
    expect(fileKind('notes.txt')).toEqual({ kind: 'notes' });
    expect(fileKind('README.md')).toEqual({ kind: 'notes' });
    expect(fileKind('main.py')).toEqual({ kind: 'code', language: 'python' });
    expect(fileKind('App.TS')).toEqual({ kind: 'code', language: 'typescript' });
    expect(fileKind('board.excalidraw')).toEqual({ kind: 'board' });
    expect(fileKind('data.csv')).toEqual({ kind: 'notes' });
  });

  it('checks file names', () => {
    const doc = new Y.Doc();
    addFile(doc, 'main.py');
    const files = listFiles(doc);
    expect(validateFileName('app', files)).toMatch(/extension/);
    expect(validateFileName('MAIN.py', files)).toMatch(/already exists/);
    expect(validateFileName('a/b.py', files)).toMatch(/slashes/);
    expect(validateFileName('app.js', files)).toBeNull();
  });

  it('creates the same starting files in two browsers at once, keeping earlier work', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.getText(codeTextKey('java')).insert(0, 'class Changed {}');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    ensureDefaultFiles(a);
    ensureDefaultFiles(b);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const names = listFiles(a).map((f) => f.name);
    expect(names).toEqual(['notes.txt', 'main.java', 'whiteboard.excalidraw']);
    expect(listFiles(b)).toEqual(listFiles(a));
    expect(listFiles(a)[0].key).toBe(NOTES_TEXT_KEY);
    expect(listFiles(a)[2].key).toBe(MAIN_BOARD_KEY);
  });

  it('starts a fresh workspace with notes, main.py and a whiteboard', () => {
    const doc = new Y.Doc();
    ensureDefaultFiles(doc);
    expect(listFiles(doc).map((f) => f.name)).toEqual(['notes.txt', 'main.py', 'whiteboard.excalidraw']);
    ensureDefaultFiles(doc); // nothing changes once files exist
    expect(listFiles(doc)).toHaveLength(3);
  });

  it('renames within the same kind and removes without deleting content', () => {
    const doc = new Y.Doc();
    const file = addFile(doc, 'draft.txt');
    doc.getText(file.key).insert(0, 'keep me');
    expect(renameFile(doc, file, 'draft.md')).toBeNull();
    expect(renameFile(doc, listFiles(doc)[0], 'draft.excalidraw')).toMatch(/cannot become a whiteboard/);
    removeFile(doc, listFiles(doc)[0]);
    expect(listFiles(doc)).toHaveLength(0);
    expect(doc.getText(file.key).toString()).toBe('keep me');
  });

  it('keeps the newest version of each whiteboard element', () => {
    const doc = new Y.Doc();
    writeBoardElements(doc, 'board:x', [{ id: 'r1', version: 2, versionNonce: 5, x: 10 }]);
    writeBoardElements(doc, 'board:x', [{ id: 'r1', version: 1, versionNonce: 1, x: 99 }]);
    expect(doc.getMap<any>('board:x').get('r1').x).toBe(10);
    writeBoardElements(doc, 'board:x', [{ id: 'r1', version: 3, versionNonce: 9, x: 20 }]);
    expect(doc.getMap<any>('board:x').get('r1').x).toBe(20);
  });
});
