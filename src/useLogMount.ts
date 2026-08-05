import { useEffect } from 'react';
import { logDebug } from './snapshots';

// Log a component's mount and unmount, gated by debug mode.
// Useful for reconstructing what was on screen from log files.
export function useLogMount(name: string): void {
  useEffect(() => {
    logDebug('component:mount', { name });
    return () => logDebug('component:unmount', { name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
