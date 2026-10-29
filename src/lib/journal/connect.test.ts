import { describe, expect, it } from "vitest";
import {
  addBookmarkMenu,
  addBookmarkShortcut,
  BROWSER_NAMES,
  detectBrowser,
  detectOs,
  devtoolsShortcut,
  showBookmarksShortcut,
  shortcut,
} from "./connect";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36";

describe("system operacyjny", () => {
  it("rozpoznaje Maca, Windowsa i Linuksa", () => {
    expect(detectOs({ userAgent: MAC, platform: "MacIntel" })).toBe("mac");
    expect(detectOs({ userAgent: WINDOWS, platform: "Win32" })).toBe("windows");
    expect(detectOs({ userAgent: LINUX, platform: "Linux x86_64" })).toBe("linux");
  });

  it("Android to nie Linux (skróty klawiszowe nie mają sensu na telefonie)", () => {
    expect(detectOs({ userAgent: ANDROID, platform: "Linux armv8l" })).toBe("other");
  });

  it("korzysta z userAgentData, gdy jest dostępne", () => {
    expect(detectOs({ userAgent: "", userAgentData: { platform: "macOS" } })).toBe("mac");
    expect(detectOs({ userAgent: "", userAgentData: { platform: "Windows" } })).toBe("windows");
  });

  it("nie wywala się bez danych", () => {
    expect(detectOs({})).toBe("other");
  });
});

describe("skróty klawiszowe", () => {
  it("na Macu używa ⌘", () => {
    expect(shortcut("mac", "Shift+B")).toBe("⌘ + Shift + B");
    expect(addBookmarkShortcut("mac")).toBe("⌘ + D");
    expect(devtoolsShortcut("mac")).toBe("⌥ + ⌘ + I");
  });

  it("na Windowsie i Linuksie używa Ctrl", () => {
    expect(showBookmarksShortcut("windows")).toBe("Ctrl + Shift + B");
    expect(showBookmarksShortcut("linux")).toBe("Ctrl + Shift + B");
    expect(addBookmarkShortcut("windows")).toBe("Ctrl + D");
    expect(devtoolsShortcut("windows")).toBe("F12");
  });

  it("każdy skrót dzieli się na osobne klawisze", () => {
    for (const value of [showBookmarksShortcut("mac"), devtoolsShortcut("mac"), addBookmarkShortcut("windows")]) {
      expect(value.split(" + ").every((part) => part.length > 0)).toBe(true);
    }
  });
});

describe("przeglądarka", () => {
  it("rozpoznaje popularne przeglądarki", () => {
    expect(detectBrowser(WINDOWS)).toBe("chrome");
    expect(detectBrowser(WINDOWS.replace("Chrome/121", "Edg/121"))).toBe("edge");
    expect(detectBrowser("Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0")).toBe("firefox");
    expect(detectBrowser(MAC)).toBe("safari");
    expect(detectBrowser(WINDOWS.replace("Chrome/121", "OPR/107"))).toBe("opera");
    expect(detectBrowser("")).toBe("other");
  });

  it("Edge nie jest brany za Chrome, a Opera za Chrome", () => {
    expect(detectBrowser("Chrome/120 Safari/537.36 Edg/120")).toBe("edge");
    expect(detectBrowser("Chrome/120 Safari/537.36 OPR/106")).toBe("opera");
  });

  it("każda przeglądarka ma nazwę i podpowiedź, gdzie dodać zakładkę", () => {
    for (const value of Object.keys(BROWSER_NAMES) as (keyof typeof BROWSER_NAMES)[]) {
      expect(BROWSER_NAMES[value].length).toBeGreaterThan(2);
      const menu = addBookmarkMenu(value);
      expect(menu.length).toBeGreaterThan(10);
      // regresja: w podpowiedziach nie może być znaków spoza polskiego alfabetu
      expect(menu).toMatch(/^[\p{L}\p{N}\s→()…+⋮☰⌘⌥]+$/u);
    }
  });
});
