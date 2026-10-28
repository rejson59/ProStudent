#!/usr/bin/env node
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { VulcanClient } from "./vulcan.mjs";
import { buildSnapshot, mapExams, mapGrades, mapHomework, mapTimetable } from "./snapshot.mjs";
import { createAgentServer, freshness, writeJson } from "./server.mjs";
import { registerDevice, AP_URL, LOGIN_URL } from "./register.mjs";

const VERSION = "1.0.0";
const DEFAULTS = { port: 8787, interval: 120, credentials: "data/credentials.json", snapshot: "data/snapshot.json", state: "data/state.json" };

const log = (...args) => console.log(...args);

const openBrowser = (url) => {
  const command =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, () => {});
};

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const readJsonFile = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
};

/** Jedno pełne odświeżenie danych. Częściowe błędy nie kasują poprzednich danych. */
export async function syncOnce({ credentialsPath, snapshotPath, statePath, now = new Date(), clientFactory }) {
  const credentials = await readJsonFile(credentialsPath);
  if (!credentials?.privateKey) {
    throw new Error("Brak data/credentials.json — najpierw uruchom `npx plecak-sync login`.");
  }

  const client = clientFactory ? clientFactory(credentials) : new VulcanClient({ credentials });
  const periodId = client.currentPeriod()?.Id;
  const errors = {};

  const attempt = async (name, fn) => {
    try {
      return await fn();
    } catch (error) {
      errors[name] = error.message;
      return null;
    }
  };

  const grades = await attempt("grades", () => client.grades(periodId));
  const timetable = await attempt("timetable", () => client.timetable(periodId));
  const exams = await attempt("exams", () => client.exams());
  const homework = await attempt("homework", () => client.homework());

  if (grades == null && timetable == null && exams == null && homework == null) {
    const message = Object.values(errors)[0] ?? "Dziennik nie zwrócił danych";
    await writeJson(statePath, { lastError: message, lastAttemptAt: now.toISOString() });
    throw new Error(`Synchronizacja nie powiodła się: ${message}`);
  }

  const pupil = credentials.pupil ?? {};
  const student = {
    name: [pupil?.Pupil?.FirstName, pupil?.Pupil?.Surname].filter(Boolean).join(" ") || undefined,
    className: pupil?.ClassDisplay || undefined,
    school: pupil?.Unit?.DisplayName || pupil?.Unit?.Name || undefined,
  };

  const snapshot = buildSnapshot({
    grades: mapGrades(grades),
    timetable: mapTimetable(timetable),
    exams: mapExams(exams),
    homework: mapHomework(homework),
    student,
    exportedAt: now.toISOString(),
  });

  await writeJson(snapshotPath, snapshot);
  await writeJson(statePath, {
    lastSync: snapshot.exportedAt,
    lastAttemptAt: now.toISOString(),
    student: student.name ?? null,
    errors: Object.keys(errors).length ? errors : undefined,
    lastError: Object.keys(errors).length ? Object.values(errors)[0] : null,
  });

  return { snapshot, errors };
}

const describe = (snapshot) => {
  const parts = [
    `${snapshot.grades?.length ?? 0} ocen`,
    `${snapshot.timetable?.filter((lesson) => !lesson.canceled).length ?? 0} lekcji`,
    `${snapshot.exams?.length ?? 0} sprawdzianów`,
    `${snapshot.homework?.length ?? 0} zadań domowych`,
  ];
  return parts.join(" · ");
};

async function cmdLogin(args) {
  log("=== Plecak — parowanie z eduVULCAN ===\n");
  let apInput = null;

  if (args["ap-file"]) {
    apInput = await readFile(args["ap-file"], "utf8");
  } else {
    openBrowser(LOGIN_URL);
    log(`1. Zaloguj się w otwartej przeglądarce: ${LOGIN_URL}`);
    log(`2. Otwórz w tej samej przeglądarce: ${AP_URL}`);
    log("3. Skopiuj całą zawartość tej strony.");
    log("4. Wklej ją tutaj i zakończ wejście:");
    log("   Windows: Ctrl+Z, potem Enter   |   macOS/Linux: Ctrl+D\n");
    apInput = await readStdin();
  }

  const { credentials } = await registerDevice(apInput, { log });
  const credentialsPath = args.credentials ?? DEFAULTS.credentials;
  await writeJson(credentialsPath, credentials);
  log(`\nZapisano ${credentialsPath} (tylko do odczytu dla Ciebie).`);
  log("Hasło nie jest nigdzie zapisywane — dalsze żądania podpisuje klucz.");
  log("\nNastępny krok: `npx plecak-sync sync`, a potem `npx plecak-sync serve`.");
}

async function cmdSync(args) {
  const result = await syncOnce({
    credentialsPath: args.credentials ?? DEFAULTS.credentials,
    snapshotPath: args.snapshot ?? DEFAULTS.snapshot,
    statePath: args.state ?? DEFAULTS.state,
  });
  log(`Zsynchronizowano: ${describe(result.snapshot)}`);
  if (Object.keys(result.errors).length) {
    log("Część danych nie została pobrana:");
    for (const [name, message] of Object.entries(result.errors)) log(`  - ${name}: ${message}`);
  }
}

async function cmdServe(args) {
  const port = Number(args.port ?? DEFAULTS.port);
  const interval = Number(args.interval ?? DEFAULTS.interval) * 60_000;
  const paths = {
    credentials: args.credentials ?? DEFAULTS.credentials,
    snapshot: args.snapshot ?? DEFAULTS.snapshot,
    state: args.state ?? DEFAULTS.state,
  };

  const run = async (first = false) => {
    try {
      const result = await syncOnce({ ...paths });
      log(`[${new Date().toLocaleTimeString("pl-PL")}] synchronizacja OK — ${describe(result.snapshot)}`);
      if (Object.keys(result.errors).length) {
        log(`  uwaga, pominięto: ${Object.keys(result.errors).join(", ")}`);
      }
    } catch (error) {
      if (first) log(`[!] ${error.message}`);
      else log(`[${new Date().toLocaleTimeString("pl-PL")}] ${error.message}`);
    }
  };

  await run(true);

  const { server, paths: resolved } = createAgentServer({ root: process.cwd(), version: VERSION });
  server.listen(port, "127.0.0.1", () => {
    log(`\nAgent nasłuchuje na http://127.0.0.1:${port}`);
    log(`Dane: ${resolved.snapshot}`);
    log(`Odświeżanie co ${Math.round(interval / 60_000)} min. Zatrzymaj: Ctrl+C.\n`);
  });

  const timer = setInterval(() => void run(false), interval);
  const close = () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

async function cmdStatus(args) {
  const credentials = await readJsonFile(args.credentials ?? DEFAULTS.credentials);
  const snapshot = await readJsonFile(args.snapshot ?? DEFAULTS.snapshot);
  const state = (await readJsonFile(args.state ?? DEFAULTS.state)) ?? {};
  const fresh = freshness(snapshot);

  log(`Wersja agenta: ${VERSION}`);
  log(`Parowanie: ${credentials ? "OK" : "brak (uruchom login)"}`);
  if (credentials) log(`Uczeń: ${credentials?.pupil?.Pupil?.FirstName ?? "?"} ${credentials?.pupil?.Pupil?.Surname ?? ""}`);
  log(`Snapshot: ${fresh.exportedAt ?? "brak"}`);
  if (fresh.ageHours !== null) log(`Wiek danych: ${fresh.ageHours} h${fresh.stale ? " — NIEŚWIEŻE" : ""}`);
  if (state.lastError) log(`Ostatni błąd: ${state.lastError}`);
  if (state.errors) log(`Pominięte zasoby: ${Object.keys(state.errors).join(", ")}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string" },
      interval: { type: "string" },
      credentials: { type: "string" },
      snapshot: { type: "string" },
      state: { type: "string" },
      "ap-file": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  const command = positionals[0] ?? "serve";

  if (values.version) {
    log(VERSION);
    return;
  }
  if (values.help) {
    log(`plecak-sync ${VERSION} — lokalny agent dla dziennika eduVULCAN

Użycie:
  npx plecak-sync login            parowanie (jednorazowe, zapisuje klucz)
  npx plecak-sync sync             jedno pobranie danych
  npx plecak-sync serve            serwer + odświeżanie w tle (domyślnie)
  npx plecak-sync status           co wiadomo o danych

Opcje:
  --port 8787       port serwera (tylko 127.0.0.1)
  --interval 120    co ile minut odświeżać
  --ap-file plik    tokeny z /api/ap z pliku zamiast wklejania
  --credentials …   ścieżka do credentials.json
`);
    return;
  }

  if (command === "login") return cmdLogin(values);
  if (command === "sync") return cmdSync(values);
  if (command === "status") return cmdStatus(values);
  if (command === "serve") return cmdServe(values);
  throw new Error(`Nieznana komenda: ${command}`);
}

if (process.argv[1] && process.argv[1].endsWith("cli.mjs")) {
  main().catch((error) => {
    console.error(`\nBłąd: ${error.message}`);
    process.exitCode = 1;
  });
}
