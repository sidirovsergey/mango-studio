// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('scrollToFinal', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as { document: Document | undefined }).document = originalDocument;
    (globalThis as { window: Window | undefined }).window = originalWindow;
  });

  it('no-op when document is undefined (SSR)', async () => {
    (globalThis as { document: Document | undefined }).document = undefined as unknown as Document;
    const mod = await import('../scroll-to-final');
    expect(() => mod.scrollToFinal()).not.toThrow();
  });

  it('no-op when #finalStage is missing', async () => {
    const mod = await import('../scroll-to-final');
    vi.spyOn(document, 'getElementById').mockReturnValue(null);
    expect(() => mod.scrollToFinal()).not.toThrow();
  });

  it('scrollIntoView smooth by default', async () => {
    const mod = await import('../scroll-to-final');
    const el = document.createElement('section');
    el.id = 'finalStage';
    el.scrollIntoView = () => {};
    document.body.appendChild(el);
    const spy = vi.spyOn(el, 'scrollIntoView');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);
    mod.scrollToFinal();
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    el.remove();
  });

  it('scrollIntoView auto when prefers-reduced-motion: reduce', async () => {
    const mod = await import('../scroll-to-final');
    const el = document.createElement('section');
    el.id = 'finalStage';
    el.scrollIntoView = () => {};
    document.body.appendChild(el);
    const spy = vi.spyOn(el, 'scrollIntoView');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);
    mod.scrollToFinal();
    expect(spy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    el.remove();
  });
});
