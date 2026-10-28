import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, createVerify, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildHeaders, canonicalUrl, httpDate } from "../src/vulcan.mjs";
import { createIdentity, identityToCredentials, toPem } from "../src/cert.mjs";
import { jwtTenant, parseAp } from "../src/register.mjs";
import { asList, buildSnapshot, gradeValue, mapExams, mapGrades, mapHomework, mapTimetable } from "../src/snapshot.mjs";
import { createAgentServer, freshness } from "../src/server.mjs";
import { resolvePaths, syncOnce } from "../src/cli.mjs";

describe("podpisywanie żądań", () => {
  test("kanoniczny adres: małe litery i pełne kodowanie", () => {
    const url =
      "https://lekcjaplus.vulcan.net.pl/szkola/api/mobile/grade/byPupil?unitId=123&pupilId=456&pageSize=500";
    assert.equal(
      canonicalUrl(url),
      "api%2fmobile%2fgrade%2fbypupil%3funitid%3d123%26pupilid%3d456%26pagesize%3d500"
    );
    assert.throws(() => canonicalUrl("https://example.com/inna/sciezka"));
  });

  test("data w nagłówku jest w GMT i zgodna z RFC 1123", () => {
    const date = httpDate(new Date("2026-10-28T10:20:30Z"));
    assert.equal(date, "Wed, 28 Oct 2026 10:20:30 GMT");
  });

  test("podpis weryfikuje się kluczem publicznym z certyfikatu", () => {
    const identity = createIdentity();
    const credentials = identityToCredentials(identity);
    const url = "https://lekcjaplus.vulcan.net.pl/szkola/api/mobile/register/hebe?mode=2";
    const date = new Date("2026-10-28T10:20:30Z");
    const headers = buildHeaders(credentials, url, null, date);

    const expected = canonicalUrl(url) + "Wed, 28 Oct 2026 10:20:30 GMT";
    const match = /signature=Base64\(sha256withrsa\((.+)\)\)$/.exec(headers.signature);
    assert.ok(match, "nagłówek signature ma oczekiwany format");
    assert.match(headers.signature, /^keyId="[0-9a-f]{40}",headers="vCanonicalUrl vDate",algorithm="sha256withrsa"/);

    const verifier = createVerify("sha256");
    verifier.update(expected, "utf8");
    const publicKey = createPublicKey({ key: identity.publicKeyDer, format: "der", type: "spki" });
    assert.equal(verifier.verify(publicKey, Buffer.from(match[1], "base64")), true);
    assert.equal(headers.vcanonicalurl, canonicalUrl(url));
    assert.equal(headers.digest, undefined, "GET bez treści nie ma nagłówka digest");
  });

  test("żądanie z treścią podpisuje też digest", () => {
    const credentials = identityToCredentials(createIdentity());
    const headers = buildHeaders(
      credentials,
      "https://lekcjaplus.vulcan.net.pl/szkola/api/mobile/register/jwt",
      '{"a":1}'
    );
    assert.match(headers.signature, /headers="vCanonicalUrl Digest vDate"/);
    assert.match(headers.digest, /^SHA-256=[A-Za-z0-9+/=]+$/);
  });

  test("certyfikat ma 20 lat ważności i poprawny PEM", async () => {
    const identity = createIdentity();
    const pem = toPem(identity.certificateDer);
    assert.match(pem, /^-----BEGIN CERTIFICATE-----\n/);
    // Node potwierdza, że DER jest poprawnym certyfikatem X.509.
    const cert = new (await import("node:crypto")).X509Certificate(pem);
    assert.equal(cert.subject, "CN=APP_CERTIFICATE CA Certificate");
    const years = (new Date(cert.validTo) - new Date(cert.validFrom)) / (365.25 * 24 * 3600 * 1000);
    assert.ok(years > 19.9 && years < 20.1, `ważność ${years} lat`);
    assert.equal(cert.fingerprint.replaceAll(":", "").toLowerCase(), identity.fingerprint);
  });
});

describe("parowanie", () => {
  const tokens = [
    `x.${Buffer.from(JSON.stringify({ tenant: "szkola" })).toString("base64url")}.y`,
    `x.${Buffer.from(JSON.stringify({ tenant: "szkola" })).toString("base64url")}.z`,
  ];

  test("tenant z JWT", () => {
    assert.equal(jwtTenant(tokens[0]), "szkola");
    assert.equal(jwtTenant("bez-kropek"), "");
    assert.equal(jwtTenant("a.b.c"), "");
  });

  test("odczyt JSON-a wklejonego bezpośrednio", () => {
    const ap = parseAp(JSON.stringify({ GivenName: "Ania", Tokens: tokens }));
    assert.equal(ap.GivenName, "Ania");
    assert.equal(ap.Tokens.length, 2);
  });

  test("odczyt z HTML <input id=ap value=…> (cudzysłowy i &quot;)", () => {
    const payload = JSON.stringify({ GivenName: "Ania", Tokens: tokens }).replace(/"/g, "&quot;");
    const html = `<html><body><input type="hidden" id="ap" value="${payload}"></body></html>`;
    const ap = parseAp(html);
    assert.equal(ap.GivenName, "Ania");
    assert.equal(ap.Tokens[0], tokens[0]);
  });

  test("czytelny błąd, gdy strony nie da się odczytać", () => {
    assert.throws(() => parseAp("<html>logowanie</html>"), /Nie znalazłem/);
    assert.throws(() => parseAp(""), /Brak danych/);
  });
});

describe("mapowanie danych z dziennika", () => {
  test("asList obsługuje listę i kopertę", () => {
    assert.deepEqual(asList([1, 2]), [1, 2]);
    assert.deepEqual(asList({ Grades: [1, 2] }), [1, 2]);
    assert.deepEqual(asList(null), []);
  });

  test("ocena: treść z plusem, waga i kategoria", () => {
    assert.equal(gradeValue({ Content: "5+", Value: 5 }), "5+");
    assert.equal(gradeValue({ Content: "", Value: 4 }), "4");
    assert.equal(gradeValue({ Content: "np.", Value: 0 }), "np.");

    const grades = mapGrades([
      {
        Id: 11,
        Content: "5+",
        Value: 5,
        Comment: "dobra robota",
        CreatedAt: "2026-10-01T12:30:00",
        Column: { Weight: 2, Category: { Name: "sprawdzian" }, Subject: { Name: "Matematyka" } },
      },
      { Id: 12, Content: "np.", Value: 0, Column: { Subject: { Name: "Matematyka" } } },
      { Id: 13, Content: "4", Value: 4, Column: { Subject: { Name: "" } } },
    ]);

    assert.equal(grades.length, 2);
    assert.deepEqual(grades[0], {
      externalId: "11",
      subject: "Matematyka",
      value: "5+",
      weight: 2,
      category: "sprawdzian",
      date: "2026-10-01",
      comment: "dobra robota",
    });
    assert.equal(grades[1].value, "np.", "oceny opisowe też przechodzą — aplikacja je odfiltruje");
  });

  test("plan: pomija ukryte i niepełne lekcje, oznacza odwołane", () => {
    const lessons = mapTimetable([
      { Id: 1, DateAt: "2026-10-26", TimeSlot: { Start: "8:00", End: "8:45" }, Subject: { Name: "Matematyka" }, Room: { Code: "12" } },
      { Id: 2, DateAt: "2026-10-26", Visible: false, TimeSlot: { Start: "8:55", End: "9:40" }, Subject: { Name: "Polski" } },
      { Id: 3, DateAt: "2026-10-26", Change: { Type: 1 }, TimeSlot: { Start: "9:50", End: "10:35" }, Subject: { Name: "Fizyka" } },
      { Id: 4, DateAt: "", TimeSlot: { Start: "10:45", End: "11:30" }, Subject: { Name: "Biologia" } },
      { Id: 5, DateAt: "2026-10-27", TimeSlot: { Start: "11:40", End: "12:25" }, Subject: { Name: "" } },
    ]);
    assert.equal(lessons.length, 2);
    assert.deepEqual(lessons[0], {
      date: "2026-10-26",
      start: "08:00",
      end: "08:45",
      subject: "Matematyka",
      room: "12",
      canceled: undefined,
    });
    assert.equal(lessons[1].canceled, true);
  });

  test("sprawdziany i zadania domowe", () => {
    const exams = mapExams([
      { Id: 7, DeadlineAt: "2026-11-05", Type: "Kartkówka", Content: "Kinematyka", Subject: { Name: "Fizyka" } },
      { Id: 8, DeadlineAt: "", Subject: { Name: "Fizyka" } },
    ]);
    assert.deepEqual(exams, [
      {
        externalId: "7",
        subject: "Fizyka",
        date: "2026-11-05",
        type: "Kartkówka",
        description: "Kinematyka",
      },
    ]);

    const homework = mapHomework([
      { Id: 21, DeadlineAt: "2026-11-03", Content: "Przeczytać rozdział 4", Subject: { Name: "Polski" } },
      { Id: 22, DeadlineAt: "2026-11-03", Content: "", Subject: { Name: "Polski" } },
    ]);
    assert.equal(homework.length, 1);
    assert.equal(homework[0].due, "2026-11-03");
  });

  test("snapshot ma zawsze format i wersję", () => {
    const snapshot = buildSnapshot({
      grades: [],
      timetable: [],
      exams: [],
      homework: [],
      student: { name: "Ania" },
      exportedAt: "2026-10-28T10:00:00.000Z",
    });
    assert.equal(snapshot.format, "plecak-import");
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.source, "eduvulcan");
    assert.equal(snapshot.student.name, "Ania");
  });
});

describe("serwer agenta", () => {
  const withServer = async (root, fn) => {
    const { server } = createAgentServer({ root });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      await fn(base);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  };

  test("bez snapshotu /health mówi prawdę, a /snapshot.json zwraca 404", async () => {
    const root = await mkdtemp(join(tmpdir(), "plecak-agent-"));
    await withServer(root, async (base) => {
      const health = await (await fetch(`${base}/health`)).json();
      assert.equal(health.ok, false);
      assert.equal(health.lastSync, null);

      const response = await fetch(`${base}/snapshot.json`);
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error, "no_snapshot");
    });
  });

  test("CORS dopuszcza GitHub Pages i żądania z sieci prywatnej", async () => {
    const root = await mkdtemp(join(tmpdir(), "plecak-agent-"));
    await withServer(root, async (base) => {
      const preflight = await fetch(`${base}/snapshot.json`, {
        method: "OPTIONS",
        headers: { origin: "https://rejson59.github.io", "access-control-request-method": "GET" },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), "https://rejson59.github.io");
      assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");

      const get = await fetch(`${base}/health`, { headers: { origin: "https://rejson59.github.io" } });
      assert.equal(get.headers.get("access-control-allow-origin"), "https://rejson59.github.io");
      assert.equal(get.headers.get("cache-control"), "no-store");
    });
  });

  test("oddaje zapisany snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "plecak-agent-"));
    await writeFile(
      join(root, "data", "snapshot.json"),
      JSON.stringify({ format: "plecak-import", version: 1, exportedAt: new Date().toISOString() }),
      { encoding: "utf8" }
    ).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(root, "data"), { recursive: true });
      await writeFile(
        join(root, "data", "snapshot.json"),
        JSON.stringify({ format: "plecak-import", version: 1, exportedAt: new Date().toISOString() })
      );
    });

    await withServer(root, async (base) => {
      const health = await (await fetch(`${base}/health`)).json();
      assert.equal(health.ok, true);
      assert.equal(health.stale, false);
      const snapshot = await (await fetch(`${base}/snapshot.json`)).json();
      assert.equal(snapshot.format, "plecak-import");
    });
  });

  test("świeżość: dane starsze niż dobę są oznaczone jako nieświeże", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    assert.equal(freshness({ exportedAt: "2026-10-28T10:00:00Z" }, now).stale, false);
    assert.equal(freshness({ exportedAt: "2026-10-26T10:00:00Z" }, now).stale, true);
    assert.equal(freshness(null, now).stale, true);
  });
});

describe("ścieżki CLI", () => {
  test("domyślne ścieżki siedzą w data/", () => {
    assert.deepEqual(resolvePaths(), {
      credentialsPath: "data/credentials.json",
      snapshotPath: "data/snapshot.json",
      statePath: "data/state.json",
    });
  });

  test("opcje CLI nadpisują ścieżki (tryb serve używa tego samego resolvera)", () => {
    const paths = resolvePaths({ credentials: "c.json", snapshot: "s.json", state: "st.json" });
    assert.deepEqual(paths, { credentialsPath: "c.json", snapshotPath: "s.json", statePath: "st.json" });
    // Regresja: wcześniej `serve` przekazywał {credentials, snapshot, state},
    // a syncOnce oczekuje *Path — zapis po cichu trafiał donikąd.
    assert.ok(!("credentials" in paths) && !("snapshot" in paths) && !("state" in paths));
  });
});

describe("synchronizacja", () => {
  const fakeClient = (data) => () => data;

  test("zapisuje snapshot i stan po udanym pobraniu", async () => {
    const root = await mkdtemp(join(tmpdir(), "plecak-sync-"));
    const credentialsPath = join(root, "credentials.json");
    await writeFile(
      credentialsPath,
      JSON.stringify({ privateKey: "x", restUrl: "https://x", pupil: { Pupil: { FirstName: "Ania", Surname: "Nowak" }, ClassDisplay: "3A", Periods: [{ Id: 1, Current: true }] } })
    );

    const result = await syncOnce({
      credentialsPath,
      snapshotPath: join(root, "snapshot.json"),
      statePath: join(root, "state.json"),
      now: new Date("2026-10-28T10:00:00Z"),
      clientFactory: fakeClient({
        currentPeriod: () => ({ Id: 1 }),
        grades: async () => [{ Id: 1, Content: "5", Value: 5, Column: { Weight: 1, Subject: { Name: "Matematyka" } } }],
        timetable: async () => [],
        exams: async () => [],
        homework: async () => [],
      }),
    });

    assert.equal(result.snapshot.grades.length, 1);
    assert.equal(result.snapshot.student.name, "Ania Nowak");
    assert.equal(result.snapshot.exportedAt, "2026-10-28T10:00:00.000Z");

    const saved = JSON.parse(await readFile(join(root, "snapshot.json"), "utf8"));
    assert.equal(saved.format, "plecak-import");
    assert.equal(JSON.parse(await readFile(join(root, "state.json"), "utf8")).lastSync, "2026-10-28T10:00:00.000Z");
  });

  test("częściowy błąd nie wywraca synchronizacji, ale trafia do stanu", async () => {
    const root = await mkdtemp(join(tmpdir(), "plecak-sync-"));
    const credentialsPath = join(root, "credentials.json");
    await writeFile(credentialsPath, JSON.stringify({ privateKey: "x", restUrl: "https://x", pupil: { Periods: [{ Id: 1 }] } }));

    const result = await syncOnce({
      credentialsPath,
      snapshotPath: join(root, "snapshot.json"),
      statePath: join(root, "state.json"),
      clientFactory: fakeClient({
        currentPeriod: () => ({ Id: 1 }),
        grades: async () => [{ Id: 1, Content: "4", Value: 4, Column: { Subject: { Name: "Fizyka" } } }],
        timetable: async () => {
          throw new Error("HTTP 500");
        },
        exams: async () => [],
        homework: async () => [],
      }),
    });

    assert.equal(result.snapshot.grades.length, 1);
    assert.equal(result.errors.timetable, "HTTP 500");
    const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
    assert.equal(state.errors.timetable, "HTTP 500");
  });

  test("gdy wszystko zawiedzie — zgłasza błąd i nie kasuje poprzedniego snapshotu", async () => {
    const root = await mkdtemp(join(tmpdir(), "plecak-sync-"));
    const credentialsPath = join(root, "credentials.json");
    await writeFile(credentialsPath, JSON.stringify({ privateKey: "x", restUrl: "https://x", pupil: {} }));
    const snapshotPath = join(root, "snapshot.json");
    await writeFile(snapshotPath, JSON.stringify({ format: "plecak-import", version: 1, exportedAt: "stare" }));

    await assert.rejects(
      syncOnce({
        credentialsPath,
        snapshotPath,
        statePath: join(root, "state.json"),
        clientFactory: fakeClient({
          currentPeriod: () => null,
          grades: async () => {
            throw new Error("403");
          },
          timetable: async () => {
            throw new Error("403");
          },
          exams: async () => {
            throw new Error("403");
          },
          homework: async () => {
            throw new Error("403");
          },
        }),
      }),
      /403/
    );

    assert.equal(JSON.parse(await readFile(snapshotPath, "utf8")).exportedAt, "stare");
  });

  test("brak parowania to czytelna podpowiedź i wpis w stanie", async () => {
    const root = await mkdtemp(join(tmpdir(), "plecak-sync-"));
    const statePath = join(root, "state.json");
    await assert.rejects(
      syncOnce({
        credentialsPath: join(root, "brak.json"),
        snapshotPath: join(root, "snapshot.json"),
        statePath,
      }),
      /login/
    );
    // /health musi móc powiedzieć, czego brakuje.
    assert.match(JSON.parse(await readFile(statePath, "utf8")).lastError, /login/);
  });
});
