import '@testing-library/jest-dom';
import { vi } from 'vitest';

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
