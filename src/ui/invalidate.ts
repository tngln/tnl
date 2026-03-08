/** Request a full UI invalidation via the global devtools hook. */
export function invalidateAll() {
  ;(globalThis as any).__TNL_DEVTOOLS__?.invalidate?.()
}
