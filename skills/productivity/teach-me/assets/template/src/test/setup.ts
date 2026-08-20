import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vite-plus/test";

expect.extend(matchers);

const values = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => values.delete(key),
  setItem: (key, value) => values.set(key, value),
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
