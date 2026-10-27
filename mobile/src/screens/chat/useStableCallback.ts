import { useCallback, useLayoutEffect, useRef } from "react";

/** Stable function identity that always calls the latest `fn` (for event handlers only). */
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}
