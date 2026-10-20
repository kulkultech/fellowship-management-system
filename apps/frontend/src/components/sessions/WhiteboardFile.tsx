import React, { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { LiveWhiteboard } from './LiveWhiteboard';
import { REMOTE_ORIGIN } from './collab';
import { writeBoardElements } from './workspaceFiles';

/**
 * An .excalidraw file. Its elements live in a shared map (element id -> newest element), so boards
 * sync, merge and persist with the rest of the workspace.
 */
export const WhiteboardFile: React.FC<{ ydoc: Y.Doc; boardKey: string; cacheKey: string; isMentor: boolean }> = ({
  ydoc,
  boardKey,
  cacheKey,
  isMentor,
}) => {
  const board = useMemo(() => ydoc.getMap<any>(boardKey), [ydoc, boardKey]);
  const [initialElements] = useState<any[]>(() => Array.from(board.values()));
  const [remote, setRemote] = useState<{ elements: any[] } | null>(null);

  // Elements changed by others (or loaded from the server) are merged into the canvas
  useEffect(() => {
    const observer = (event: Y.YMapEvent<any>, tx: Y.Transaction) => {
      if (tx.local && tx.origin !== REMOTE_ORIGIN && tx.origin !== 'seed') return;
      const changed: any[] = [];
      event.keysChanged.forEach((id) => {
        const el = board.get(id);
        if (el) changed.push(el);
      });
      if (changed.length > 0) setRemote({ elements: changed });
    };
    board.observe(observer);
    return () => board.unobserve(observer);
  }, [board]);

  return (
    <LiveWhiteboard
      sessionId={cacheKey}
      isMentor={isMentor}
      initialElements={initialElements}
      onElementsChange={(elements) => writeBoardElements(ydoc, boardKey, elements)}
      remoteWhiteboardUpdate={remote}
      embedded
    />
  );
};
