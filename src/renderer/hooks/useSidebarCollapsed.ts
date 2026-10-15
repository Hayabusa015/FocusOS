import { useCallback, useEffect, useState } from 'react';

const KEY = 'cortex.sidebar.collapsed';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the side rail is folded down to its icons. The choice is remembered between launches;
 * if storage is unavailable the rail still works, it just starts open every time.
 */
export function useSidebarCollapsed(): [collapsed: boolean, toggle: () => void] {
  const [collapsed, setCollapsed] = useState(read);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch {
      // Nothing to do: the rail works without remembering.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((was) => !was), []);
  return [collapsed, toggle];
}
