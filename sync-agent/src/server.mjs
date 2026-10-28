import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Serwer lokalny dla aplikacji Plecak.
 *
 * Nasłuchuje wyłącznie na 127.0.0.1 — dane nie wychodzą poza ten komputer.
 * Aplikacja (GitHub Pages) pyta go o gotowy snapshot; nie zna żadnych sekretów.
 */

export const ALLOWED_ORIGINS = [
  "https://rejson59.github.io",
  "https://prostudent.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export const DEFAULT_PATHS = {
  credentials: "data/credentials.json",
  snapshot: "data/snapshot.json",
  state: "data/state.json",
};

const readJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
};

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
}

/** Ile godzin może mieć snapshot, zanim uznamy go za nieświeży. */
export const STALE_HOURS = 24;

export function freshness(snapshot, now = Date.now()) {
  const exportedAt = snapshot?.exportedAt ? Date.parse(snapshot.exportedAt) : NaN;
  if (!Number.isFinite(exportedAt)) return { exportedAt: null, ageHours: null, stale: true };
  const ageHours = Math.round(((now - exportedAt) / 3_600_000) * 10) / 10;
  return { exportedAt: snapshot.exportedAt, ageHours, stale: ageHours > STALE_HOURS };
}

export function createAgentServer({ root = process.cwd(), version = "1.0.0" } = {}) {
  const paths = {
    credentials: join(root, DEFAULT_PATHS.credentials),
    snapshot: join(root, DEFAULT_PATHS.snapshot),
    state: join(root, DEFAULT_PATHS.state),
  };

  const cors = (origin) => {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin);
    return {
      "access-control-allow-origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-allow-private-network": "true",
      "access-control-max-age": "86400",
      vary: "Origin",
    };
  };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const headers = { "cache-control": "no-store", ...cors(origin) };

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405, { ...headers, "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const state = (await readJson(paths.state)) ?? {};
    const snapshot = await readJson(paths.snapshot);

    if (url.pathname === "/health") {
      const fresh = freshness(snapshot);
      res.writeHead(200, { ...headers, "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: Boolean(snapshot),
          version,
          lastSync: fresh.exportedAt,
          ageHours: fresh.ageHours,
          stale: fresh.stale,
          student: snapshot?.student?.name ?? state.student ?? null,
          lastError: state.lastError ?? null,
        })
      );
      return;
    }

    if (url.pathname === "/snapshot.json") {
      if (!snapshot) {
        res.writeHead(404, { ...headers, "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "no_snapshot", lastError: state.lastError ?? null }));
        return;
      }
      res.writeHead(200, { ...headers, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(snapshot));
      return;
    }

    if (url.pathname === "/") {
      const fresh = freshness(snapshot);
      res.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset="utf-8"><title>Plecak — agent synchronizacji</title>
<body style="font-family:system-ui;max-width:34rem;margin:3rem auto;line-height:1.6">
<h1>Agent synchronizacji działa</h1>
<p>Ostatnia synchronizacja: <b>${fresh.exportedAt ?? "brak"}</b>${fresh.stale ? " (dane nieświeże)" : ""}</p>
<p>Uczeń: <b>${snapshot?.student?.name ?? "—"}</b></p>
<p>Endpointy: <code>/health</code>, <code>/snapshot.json</code></p>
<p style="color:#666">Ten serwer nasłuchuje tylko na 127.0.0.1. Zamknij okno, aby go zatrzymać.</p>
</body>`);
      return;
    }

    res.writeHead(404, { ...headers, "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });

  return { server, paths };
}
