import { useEffect, useState } from 'react';

export const focusItemDomId = (id: string) => `item-${id}`;

/**
 * Opening a shared link to one item (an assignment, resource or module): once the list has loaded,
 * scroll that item into view and return its id for a few seconds so it can be highlighted.
 */
export function useFocusItem(focusId: string | undefined, ready: boolean): string | null {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId || !ready) return;
    const el = document.getElementById(focusItemDomId(focusId));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(focusId);
    const timer = setTimeout(() => setHighlighted(null), 4000);
    return () => clearTimeout(timer);
  }, [focusId, ready]);

  return highlighted;
}
