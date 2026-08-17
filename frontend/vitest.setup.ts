import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock localStorage
const localStorageMock = {
  store: new Map(),
  getItem: vi.fn((key) => localStorageMock.store.get(key) ?? null),
  setItem: vi.fn((key, value) => localStorageMock.store.set(key, value)),
  removeItem: vi.fn((key) => localStorageMock.store.delete(key)),
  clear: vi.fn(() => localStorageMock.store.clear()),
  get length() {
    return localStorageMock.store.size;
  },
  key: vi.fn((index) => [...localStorageMock.store.keys()][index] || null),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })),
});
