import { describe, expect, it } from "vitest";
import { HASH_PREFIX, decodeSnapshotParam, encodeSnapshotParam, readSnapshotFromHash } from "./hash";
import { bookmarkletCode, bridgeUrl, consoleSnippet } from "./bookmarklet";
import type { JournalSnapshot } from "./types";

const snapshot: JournalSnapshot = {
  format: "plecak-import",
  version: 1,
  source: "eduvulcan",
  exportedAt: "2026-10-28T10:00:00.000Z",
  student: { name: "Ania Nowak" },
  grades: [{ externalId: "1", subject: "Matematyka", value: "5+" }],
  timetable: [{ date: "2026-10-26", start: "08:00", end: "08:45", subject: "Matematyka" }],
};

describe("przekazanie danych przez adres", () => {
  it("koduje i dekoduje snapshot (polskie znaki włącznie)", () => {
    const encoded = encodeSnapshotParam({ ...snapshot, student: { name: "Zażółć Gęślą Jaźń" } });
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = decodeSnapshotParam(encoded);
    expect(decoded?.student?.name).toBe("Zażółć Gęślą Jaźń");
    expect(decoded?.grades).toHaveLength(1);
  });

  it("czyta snapshot z całego adresu", () => {
    const hash = `#${HASH_PREFIX}${encodeSnapshotParam(snapshot)}`;
    expect(readSnapshotFromHash(hash)?.source).toBe("eduvulcan");
    expect(readSnapshotFromHash("#cokolwiek")).toBeUndefined();
    expect(readSnapshotFromHash("")).toBeUndefined();
  });

  it("śmieci w adresie nie wywracają aplikacji", () => {
    expect(decodeSnapshotParam("to-nie-jest-base64!")).toBeUndefined();
    expect(readSnapshotFromHash(`#${HASH_PREFIX}%%%`)).toBeUndefined();
    // Poprawny base64, ale nie nasz format.
    expect(decodeSnapshotParam(btoa("{}").replace(/=+$/, ""))).toBeUndefined();
  });
});

describe("zakładka do dziennika", () => {
  it("wskazuje plik mostu na GitHub Pages", () => {
    expect(bridgeUrl()).toBe("https://rejson59.github.io/ProStudent/plecak-sync.js");
    expect(bridgeUrl("https://example.com/app/")).toBe("https://example.com/app/plecak-sync.js");
  });

  it("kod zakładki jest poprawnym adresem javascript: bez cudzysłowów", () => {
    const code = bookmarkletCode();
    expect(code.startsWith("javascript:")).toBe(true);
    expect(code).toContain("plecak-sync.js");
    expect(code).not.toContain('"');
    // Po wklejeniu w pole adresu przeglądarka musi mieć co uruchomić.
    expect(code).toContain("__plecakSync");
  });

  it("wersja do konsoli różni się tylko brakiem prefiksu", () => {
    expect(bookmarkletCode()).toBe(`javascript:${consoleSnippet()}`);
    expect(consoleSnippet()).not.toContain("javascript:");
  });
});
