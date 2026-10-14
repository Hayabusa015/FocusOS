import { useCallback } from 'react';
import { useLive } from './useLive';

export function useAreas() {
  const load = useCallback(() => window.cortex.areas.list(), []);
  return useLive(load).data;
}
