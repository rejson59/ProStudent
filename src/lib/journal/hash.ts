import { decodeSnapshot, type JournalSnapshot } from "./types";

/**
 * Przekazanie danych z zakładki (działającej na stronie dziennika) do Plecaka.
 *
 * Używamy fragmentu adresu (`#dziennik=…`), bo nie trafia on do serwera,
 * nie zostaje w historii żądań i nie wymaga żadnego backendu.
 */

export const HASH_PREFIX = "dziennik=";

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string): string => {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normal + "=".repeat((4 - (normal.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export function encodeSnapshotParam(snapshot: JournalSnapshot): string {
  return toBase64Url(JSON.stringify(snapshot));
}

/** Zwraca `undefined` dla śmieci — nigdy nie rzuca na danych z adresu. */
export function decodeSnapshotParam(value: string): JournalSnapshot | undefined {
  try {
    return decodeSnapshot(JSON.parse(fromBase64Url(decodeURIComponent(value))));
  } catch {
    return undefined;
  }
}

/** Wyciąga snapshot z całego `location.hash` (albo zwraca `undefined`). */
export function readSnapshotFromHash(hash: string): JournalSnapshot | undefined {
  const index = hash.indexOf(HASH_PREFIX);
  if (index === -1) return undefined;
  return decodeSnapshotParam(hash.slice(index + HASH_PREFIX.length));
}
