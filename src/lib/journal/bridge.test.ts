import { describe, expect, it, vi } from "vitest";
import { X509Certificate, createPublicKey, createVerify } from "node:crypto";
import {
  buildHeaders,
  canonicalUrl,
  createIdentity,
  fetchSnapshot,
  fromBase64,
  importPrivateKey,
  jwtTenant,
  mapExams,
  mapGrades,
  mapHomework,
  mapTimetable,
  pairDevice,
  readApTokens,
  toBase64Url,
} from "../../../public/plecak-sync.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const token = (tenant: string) =>
  `x.${Buffer.from(JSON.stringify({ tenant })).toString("base64url")}.y`;

describe("most do dziennika — kryptografia", () => {
  it("generuje klucz i certyfikat X.509 akceptowany przez Node", async () => {
    const identity = await createIdentity();
    const wrapped = (identity.certificate.match(/.{1,64}/g) ?? []).join("\n");
    const cert = new X509Certificate(`-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`);

    expect(cert.subject).toBe("CN=APP_CERTIFICATE CA Certificate");
    expect(cert.fingerprint.replace(/:/g, "").toLowerCase()).toBe(identity.fingerprint);
    const years = (new Date(cert.validTo).getTime() - new Date(cert.validFrom).getTime()) / (365.25 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(19.9);
    expect(years).toBeLessThan(20.1);
  });

  it("kanoniczny adres: małe litery i pełne kodowanie", () => {
    const url =
      "https://lekcjaplus.vulcan.net.pl/szkola/api/mobile/grade/byPupil?unitId=123&pageSize=500";
    expect(canonicalUrl(url)).toBe(
      "api%2fmobile%2fgrade%2fbypupil%3funitid%3d123%26pagesize%3d500"
    );
    expect(() => canonicalUrl("https://example.com/inna")).toThrow();
  });

  it("podpis żądania weryfikuje się kluczem publicznym", async () => {
    const identity = await createIdentity();
    const key = await importPrivateKey(identity.privateKey);
    const url = "https://lekcjaplus.vulcan.net.pl/szkola/api/mobile/register/hebe?mode=2";
    const headers = await buildHeaders(identity, key, url, null, new Date("2026-10-28T10:20:30Z"));

    expect(headers.signature).toMatch(
      /^keyId="[0-9a-f]{40}",headers="vCanonicalUrl vDate",algorithm="sha256withrsa",signature=Base64\(sha256withrsa\(.+\)\)$/
    );
    expect(headers.vdate).toBe("Wed, 28 Oct 2026 10:20:30 GMT");
    expect(headers.digest).toBeUndefined();

    const signature = /signature=Base64\(sha256withrsa\((.+)\)\)$/.exec(headers.signature)![1];
    const verifier = createVerify("sha256");
    verifier.update(`${canonicalUrl(url)}Wed, 28 Oct 2026 10:20:30 GMT`, "utf8");
    const publicKey = createPublicKey({ key: Buffer.from(identity.publicKey, "base64"), format: "der", type: "spki" });
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64"))).toBe(true);
  });

  it("żądanie z treścią podpisuje też digest", async () => {
    const identity = await createIdentity();
    const key = await importPrivateKey(identity.privateKey);
    const headers = await buildHeaders(identity, key, "https://lekcjaplus.vulcan.net.pl/szkola/api/mobile/register/jwt", '{"a":1}');
    expect(headers.signature).toContain('headers="vCanonicalUrl Digest vDate"');
    expect(headers.digest).toMatch(/^SHA-256=[A-Za-z0-9+/=]+$/);
  });

  it("base64url bez dopełnienia czyta się poprawnie", () => {
    expect(new TextDecoder().decode(fromBase64(toBase64Url("Zażółć")))).toBe("Zażółć");
  });
});

describe("most do dziennika — odczyt sesji", () => {
  const apHtml = (payload: object) =>
    `<html><body><input type="hidden" id="ap" value="${JSON.stringify(payload).replace(/"/g, "&quot;")}"></body></html>`;

  it("czyta tokeny z /api/ap", async () => {
    const fetchImpl = vi.fn(async () => new Response(apHtml({ GivenName: "Ania", Surname: "Nowak", Tokens: [token("szkola")] })));
    const result = await readApTokens(fetchImpl as unknown as typeof fetch);
    expect(result.tokens).toHaveLength(1);
    expect(result.name).toBe("Ania Nowak");
  });

  it("brak sesji to czytelna podpowiedź o logowaniu", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>Logowanie</html>", { status: 200 }));
    await expect(readApTokens(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/zaloguj się/i);
  });

  it("tenant z JWT (także base64url bez paddingu)", () => {
    expect(jwtTenant(token("szkola"))).toBe("szkola");
    expect(jwtTenant("brak")).toBe("");
  });
});

describe("most do dziennika — mapowanie", () => {
  it("oceny: zachowuje plus, wagę i kategorię", () => {
    const grades = mapGrades([
      {
        Id: 11,
        Content: "5+",
        Value: 5,
        CreatedAt: "2026-10-01T12:30:00",
        Column: { Weight: 2, Category: { Name: "sprawdzian" }, Subject: { Name: "Matematyka" } },
      },
      { Id: 12, Content: "np.", Value: 0, Column: { Subject: { Name: "Matematyka" } } },
    ]) as Record<string, unknown>[];
    expect(grades).toHaveLength(1);
    expect(grades[0]).toMatchObject({ subject: "Matematyka", value: "5+", weight: 2, category: "sprawdzian", date: "2026-10-01" });
  });

  it("plan: pomija ukryte, uzupełnia zera w godzinach", () => {
    const lessons = mapTimetable([
      { DateAt: "2026-10-26", TimeSlot: { Start: "8:00", End: "8:45" }, Subject: { Name: "Matematyka" }, Room: { Code: "12" } },
      { DateAt: "2026-10-26", Visible: false, TimeSlot: { Start: "9:00", End: "9:45" }, Subject: { Name: "Polski" } },
    ]) as Record<string, unknown>[];
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ start: "08:00", end: "08:45", room: "12" });
  });

  it("sprawdziany i zadania", () => {
    expect(mapExams([{ Id: 7, DeadlineAt: "2026-11-05", Type: "Kartkówka", Subject: { Name: "Fizyka" } }])[0]).toMatchObject({
      type: "Kartkówka",
      date: "2026-11-05",
    });
    expect(mapHomework([{ Id: 21, DeadlineAt: "2026-11-03", Content: "Rozdział 4", Subject: { Name: "Polski" } }])[0]).toMatchObject({
      due: "2026-11-03",
      description: "Rozdział 4",
    });
    expect(mapHomework([{ Id: 22, DeadlineAt: "2026-11-03", Content: "", Subject: { Name: "Polski" } }])).toHaveLength(0);
  });
});

describe("most do dziennika — pełny przepływ", () => {
  const pupil = {
    Pupil: { FirstName: "Ania", Surname: "Nowak", Id: 7 },
    Unit: { Id: 3, Symbol: "szkola", DisplayName: "LO nr 1" },
    ClassDisplay: "3A",
    Periods: [{ Id: 1, Current: true }],
    Journal: { StartAt: "2026-09-01", EndAt: "2027-06-25" },
  };

  const fakeFetch = (calls: string[]) => {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("register/jwt")) return json({ Status: { Code: 0 }, Envelope: { RestURL: "https://lekcjaplus.vulcan.net.pl/szkola" } });
      if (url.includes("register/hebe")) return json({ Envelope: [pupil] });
      if (url.includes("grade/byPupil"))
        return json({
          Envelope: [
            { Id: 1, Content: "5", Value: 5, CreatedAt: "2026-10-01", Column: { Weight: 1, Subject: { Name: "Matematyka" } } },
          ],
        });
      if (url.includes("schedule/withchanges"))
        return json({
          Envelope: [
            { DateAt: "2026-10-26", TimeSlot: { Start: "08:00", End: "08:45" }, Subject: { Name: "Matematyka" } },
            { DateAt: "2026-10-26", TimeSlot: { Start: "08:55", End: "09:40" }, Subject: { Name: "Polski" } },
          ],
        });
      if (url.includes("exam/byPupil"))
        return json({ Envelope: [{ Id: 7, DeadlineAt: "2026-11-05", Type: "Sprawdzian", Subject: { Name: "Fizyka" } }] });
      if (url.includes("homework/byPupil"))
        return json({ Envelope: [{ Id: 21, DeadlineAt: "2026-11-03", Content: "Rozdział 4", Subject: { Name: "Polski" } }] });
      return json({ Envelope: [] });
    });
  };

  it("paruje urządzenie i pobiera komplet danych", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch(calls);

    const { credentials, privateKey } = await pairDevice({
      tokens: [token("szkola")],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(credentials.restUrl).toBe("https://lekcjaplus.vulcan.net.pl/szkola");
    expect(credentials.pupil?.ClassDisplay).toBe("3A");

    const snapshot = (await fetchSnapshot(credentials, privateKey, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-10-28T10:00:00Z"),
    })) as {
      format: string;
      source: string;
      grades: unknown[];
      timetable: unknown[];
      exams: unknown[];
      homework: unknown[];
      student: { name: string };
    };

    expect(snapshot.format).toBe("plecak-import");
    expect(snapshot.source).toBe("eduvulcan");
    expect(snapshot.student.name).toBe("Ania Nowak");
    expect(snapshot.grades).toHaveLength(1);
    expect(snapshot.timetable).toHaveLength(2);
    expect(snapshot.exams).toHaveLength(1);
    expect(snapshot.homework).toHaveLength(1);

    // Plan pobierany jest z okna ±2-3 tygodnie, a nie z całego roku.
    const scheduleCall = calls.find((url) => url.includes("schedule/withchanges"))!;
    expect(scheduleCall).toContain("dateFrom=2026-10-14");
    expect(scheduleCall).toContain("dateTo=2026-11-18");
  });

  it("pojedynczy brakujący zasób nie psuje całości", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("grade/byPupil"))
        return json({ Envelope: [{ Id: 1, Content: "4", Value: 4, Column: { Subject: { Name: "Fizyka" } } }] });
      if (url.includes("schedule")) return json({ Status: { Code: 5, Message: "brak" } }, 500);
      return json({ Envelope: [] });
    });

    const { credentials, privateKey } = await pairDevice({
      tokens: [token("szkola")],
      fetchImpl: fakeFetch([]) as unknown as typeof fetch,
    });
    const snapshot = (await fetchSnapshot(credentials, privateKey, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) as { grades: unknown[]; timetable: unknown[] };
    expect(snapshot.grades).toHaveLength(1);
    expect(snapshot.timetable).toHaveLength(0);
  });

  it("błąd rejestracji jest opisany po ludzku", async () => {
    const fetchImpl = vi.fn(async () => json({ Status: { Code: 401, Message: "Brak uprawnień" } }, 401));
    await expect(
      pairDevice({ tokens: [token("szkola")], fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow(/HTTP 401/);
  });
});
