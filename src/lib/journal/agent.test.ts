import { afterEach, describe, expect, it, vi } from "vitest";
import { agentStatus, fetchAgentSnapshot } from "./agent";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agentStatus", () => {
  it("czyta stan agenta z /health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ ok: true, version: "1.0.0", lastSync: "2026-10-28T10:00:00.000Z", student: "Ania" }))
    );
    const status = await agentStatus();
    expect(status.online).toBe(true);
    expect(status.ok).toBe(true);
    expect(status.student).toBe("Ania");
  });

  it("brak agenta to nie wyjątek, tylko online: false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    expect(await agentStatus()).toEqual({ ok: false, online: false });
  });

  it("agent bez danych ma ok: false, ale online: true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: false, version: "1.0.0", lastSync: null })));
    const status = await agentStatus();
    expect(status.online).toBe(true);
    expect(status.ok).toBe(false);
  });
});

describe("fetchAgentSnapshot", () => {
  it("zwraca zdekodowany snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ format: "plecak-import", version: 1, source: "eduvulcan", exportedAt: "2026-10-28T10:00:00.000Z" })
      )
    );
    const result = await fetchAgentSnapshot();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot.source).toBe("eduvulcan");
  });

  it("404 mówi o braku logowania, a nie o braku agenta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: false, error: "no_snapshot" }, 404)));
    const result = await fetchAgentSnapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("login");
  });

  it("odrzuca dane w nieznanym formacie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ format: "cos-innego", version: 2 })));
    const result = await fetchAgentSnapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("nieznanym formacie");
  });

  it("brak połączenia to czytelny komunikat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    const result = await fetchAgentSnapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Nie znaleziono lokalnego agenta");
  });
});
