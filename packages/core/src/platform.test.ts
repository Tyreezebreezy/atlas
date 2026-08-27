import { describe, expect, it } from 'vitest';
import { isTauriRuntime } from './platform';

describe('isTauriRuntime', () => {
  it('is false outside a Tauri webview', () => {
    expect(isTauriRuntime()).toBe(false);
  });
});
