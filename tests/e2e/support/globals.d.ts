// Test state that init scripts and page code keep on `window`.
export {};

declare global {
  interface Window {
    __clipboard?: string[];
    __live?: string[];
    __csp?: string[];
    __defined?: string[];
    __pageClass?: CustomElementConstructor;
    __loadWa: () => Promise<void>;
    __metaUrl?: string;
    __events?: string[];
    __copyMarks?: Array<{ text: string; at: number }>;
    __insecure?: boolean;
    __random?: { crypto: number; math: number };
    __wasm?: { calls: Array<{ name: string; ms: number }>; fail: boolean };
  }
}
