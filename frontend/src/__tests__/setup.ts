import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom has no matchMedia; the theme store reads it at import time
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  });
}

// Mock axios to prevent real HTTP calls in tests
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock framer-motion — tests don't need animation
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => ({ children, ...rest }: { children?: unknown; [k: string]: unknown }) => children,
  }),
  AnimatePresence: ({ children }: { children: unknown }) => children,
  useAnimation: vi.fn(),
}));

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}
