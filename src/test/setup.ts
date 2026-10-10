import "@testing-library/jest-dom";

// Node 25+ has its own localStorage and sessionStorage globals, and they win
// over jsdom's. localStorage is undefined unless Node is started with
// --localstorage-file, and neither is a jsdom Storage, so spying on
// Storage.prototype misses them. On those versions, put a plain in-memory
// Storage in place of all three so tests behave the same on every Node.
// CI runs the .nvmrc version, where jsdom's storage is used untouched.
class MemoryStorage {
  #items = new Map<string, string>();
  get length() { return this.#items.size; }
  key(index: number) { return [...this.#items.keys()][index] ?? null; }
  getItem(key: string) { return this.#items.get(String(key)) ?? null; }
  setItem(key: string, value: string) { this.#items.set(String(key), String(value)); }
  removeItem(key: string) { this.#items.delete(String(key)); }
  clear() { this.#items.clear(); }
}

function isJsdomStorage(name: "localStorage" | "sessionStorage") {
  try {
    return globalThis[name] instanceof Storage;
  } catch {
    return false;
  }
}

if (!isJsdomStorage("localStorage") || !isJsdomStorage("sessionStorage")) {
  Object.defineProperty(globalThis, "Storage", { configurable: true, writable: true, value: MemoryStorage });
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: new MemoryStorage() });
  }
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
