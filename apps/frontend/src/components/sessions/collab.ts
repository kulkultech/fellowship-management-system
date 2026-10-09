import * as Y from 'yjs';

/** Transaction origin for edits made by this browser; remote updates use REMOTE_ORIGIN. */
export const LOCAL_ORIGIN = 'local';
export const REMOTE_ORIGIN = 'remote';

export const codeTextKey = (lang: string) => `code:${lang}`;
export const NOTES_TEXT_KEY = 'notes';

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** FNV-1a hash, used to derive a stable Yjs client ID from seed content. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Keep away from 0 and leave room so it never matches a random real client ID by design
  return (hash % 0x7ffffffe) + 1;
}

/**
 * Builds the update that seeds a shared text with starting content. Every browser derives the
 * same client ID from the same content, so concurrent seeds produce identical updates that Yjs
 * merges into one copy instead of duplicating the text.
 */
export function deterministicSeedUpdate(key: string, content: string): Uint8Array {
  const seedDoc = new Y.Doc();
  seedDoc.clientID = fnv1a(`${key}\u0000${content}`);
  seedDoc.getText(key).insert(0, content);
  const update = Y.encodeStateAsUpdate(seedDoc);
  seedDoc.destroy();
  return update;
}

/** Applies the minimal edit that turns `oldValue` into `newValue` to a Y.Text. */
export function applyTextDiff(ytext: Y.Text, oldValue: string, newValue: string) {
  if (oldValue === newValue) return;
  let start = 0;
  const maxStart = Math.min(oldValue.length, newValue.length);
  while (start < maxStart && oldValue[start] === newValue[start]) start++;
  let oldEnd = oldValue.length;
  let newEnd = newValue.length;
  while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  ytext.doc!.transact(() => {
    if (oldEnd > start) ytext.delete(start, oldEnd - start);
    if (newEnd > start) ytext.insert(start, newValue.slice(start, newEnd));
  }, LOCAL_ORIGIN);
}

/** Maps a caret position through a Y.Text change so it stays at the same logical place. */
export function mapPositionThroughDelta(delta: Y.YTextEvent['delta'], position: number): number {
  let oldIndex = 0;
  let shift = 0;
  for (const op of delta) {
    if (oldIndex >= position) break;
    if (op.retain !== undefined) {
      oldIndex += op.retain;
    } else if (typeof op.insert === 'string') {
      shift += op.insert.length;
    } else if (op.delete !== undefined) {
      const removed = Math.min(op.delete, position - oldIndex);
      shift -= removed;
      oldIndex += op.delete;
    }
  }
  return Math.max(0, position + shift);
}

/**
 * Keeps a Monaco editor model and a Y.Text in sync with minimal edits, so remote typing never
 * replaces the whole document or moves the local cursor. Returns a function that unbinds.
 */
export function bindMonacoToYText(editor: any, ytext: Y.Text): () => void {
  const model = editor.getModel();
  if (!model) return () => {};
  let applyingRemote = false;

  // Start from the shared content
  if (model.getValue() !== ytext.toString()) {
    applyingRemote = true;
    model.setValue(ytext.toString());
    applyingRemote = false;
  }

  const contentSub = editor.onDidChangeModelContent((e: any) => {
    if (applyingRemote) return;
    // Changes are relative to the previous content; apply from the end so offsets stay valid
    const changes = [...e.changes].sort((a: any, b: any) => b.rangeOffset - a.rangeOffset);
    ytext.doc!.transact(() => {
      for (const change of changes) {
        if (change.rangeLength > 0) ytext.delete(change.rangeOffset, change.rangeLength);
        if (change.text) ytext.insert(change.rangeOffset, change.text);
      }
    }, LOCAL_ORIGIN);
  });

  const observer = (event: Y.YTextEvent, tx: Y.Transaction) => {
    if (tx.origin === LOCAL_ORIGIN || model.isDisposed?.()) return;
    // Convert the delta (old-document coordinates) into Monaco edits applied together
    const edits: any[] = [];
    let oldIndex = 0;
    for (const op of event.delta) {
      if (op.retain !== undefined) {
        oldIndex += op.retain;
      } else if (typeof op.insert === 'string') {
        const pos = model.getPositionAt(oldIndex);
        edits.push({
          range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
          text: op.insert,
        });
      } else if (op.delete !== undefined) {
        const start = model.getPositionAt(oldIndex);
        const end = model.getPositionAt(oldIndex + op.delete);
        edits.push({
          range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
          text: '',
        });
        oldIndex += op.delete;
      }
    }
    if (edits.length === 0) return;
    applyingRemote = true;
    try {
      model.applyEdits(edits);
    } finally {
      applyingRemote = false;
    }
    // Safety net: never let the editor drift from the shared text
    if (model.getValue() !== ytext.toString()) {
      applyingRemote = true;
      model.setValue(ytext.toString());
      applyingRemote = false;
    }
  };
  ytext.observe(observer);

  return () => {
    contentSub.dispose();
    ytext.unobserve(observer);
  };
}
