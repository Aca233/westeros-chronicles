import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  disconnect() {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
  }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  unobserve() {}
  constructor(private readonly callback: IntersectionObserverCallback) {}
}

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: IntersectionObserverStub });
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: IntersectionObserverStub });
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
Object.defineProperty(window, 'requestIdleCallback', {
  writable: true,
  value: vi.fn(() => 1),
});
Object.defineProperty(window, 'cancelIdleCallback', {
  writable: true,
  value: vi.fn(),
});
Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(window, 'alert', { writable: true, value: vi.fn() });
Object.defineProperty(window, 'confirm', { writable: true, value: vi.fn(() => true) });


afterEach(() => cleanup());
