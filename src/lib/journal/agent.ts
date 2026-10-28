import { decodeSnapshot, type JournalSnapshot } from "./types";

/**
 * Klient lokalnego agenta synchronizacji (`sync-agent/`).
 *
 * Agent działa na komputerze użytkownika (domyślnie `http://127.0.0.1:8787`),
 * pobiera dane z dziennika i wystawia je jako `plecak-import-v1.json`.
 * Aplikacja nie zna żadnych danych logowania — tylko pyta o gotowy plik.
 */

export const AGENT_URL = "http://127.0.0.1:8787";

export type AgentStatus = {
  ok: boolean;
  online: boolean;
  version?: string;
  lastSync?: string;
  student?: string;
  error?: string;
};

const withTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 4000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
};

export async function agentStatus(base = AGENT_URL): Promise<AgentStatus> {
  try {
    const response = await withTimeout(`${base}/health`, {}, 2500);
    if (!response.ok) return { ok: false, online: false, error: `HTTP ${response.status}` };
    const data = (await response.json()) as { version?: string; lastSync?: string; student?: string };
    return { ok: true, online: true, ...data };
  } catch {
    return { ok: false, online: false };
  }
}

export type AgentFetch = { ok: true; snapshot: JournalSnapshot } | { ok: false; error: string };

export async function fetchAgentSnapshot(base = AGENT_URL): Promise<AgentFetch> {
  try {
    const response = await withTimeout(`${base}/snapshot.json`, {}, 6000);
    if (response.status === 404) {
      return {
        ok: false,
        error: "Agent działa, ale nie ma jeszcze danych — uruchom jednorazowo `node src/cli.mjs login` w katalogu sync-agent",
      };
    }
    if (!response.ok) {
      return { ok: false, error: `Agent odpowiedział HTTP ${response.status}` };
    }
    const raw: unknown = await response.json();
    const snapshot = decodeSnapshot(raw);
    if (!snapshot) return { ok: false, error: "Agent zwrócił dane w nieznanym formacie" };
    return { ok: true, snapshot };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message.includes("abort") ? "Agent nie odpowiedział w czasie" : "Nie znaleziono lokalnego agenta",
    };
  }
}
