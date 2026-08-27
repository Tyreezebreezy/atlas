/** True inside the Tauri desktop shell, false in a plain browser/PWA context. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
