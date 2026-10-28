/**
 * Plecak — most do dziennika eduVULCAN.
 *
 * Uruchamiany jako zakładka (bookmarklet) albo wklejony w konsolę **na stronie
 * dziennika**. Dzięki temu korzysta z sesji, którą użytkownik ma już otwartą:
 * nie ma tu żadnego formularza hasła ani serwera.
 *
 * Co robi:
 *  1. czyta tokeny z /api/ap (ta sama domena, więc sesja działa),
 *  2. raz rejestruje klucz urządzenia (RSA + certyfikat, jak oficjalna aplikacja),
 *     i zapisuje go w localStorage dziennika — kolejne kliknięcia go używają,
 *  3. pobiera oceny, plan, sprawdziany i zadania domowe,
 *  4. pakuje je w `plecak-import-v1` i otwiera Plecak z podglądem importu.
 *
 * Plik jest czystym JavaScriptem (bez zależności), żeby dało się go wczytać
 * z GitHub Pages na dowolnej stronie dziennika.
 */

const LOGIN_ORIGIN = "https://eduvulcan.pl";
const API_HOST = "https://lekcjaplus.vulcan.net.pl";
const PLECAK_URL = "https://rejson59.github.io/ProStudent/";
const STORAGE_KEY = "plecak-sync:credentials";
const MAX_URL = 900_000;

/* ------------------------------- bajty -------------------------------- */

const utf8 = (value) => new TextEncoder().encode(value);
const text = (bytes) => new TextDecoder().decode(bytes);

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(value) {
  // atob wymaga dopełnienia, a base64url z JWT-ów go nie ma.
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64Url(value) {
  return toBase64(utf8(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/* -------------------------------- DER --------------------------------- */

export function derLength(length) {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

export const tlv = (tag, content) => concat(new Uint8Array([tag]), derLength(content.length), content);
export const seq = (...items) => tlv(0x30, concat(...items));
export const set = (...items) => tlv(0x31, concat(...items));
export const utf8String = (value) => tlv(0x0c, utf8(value));
export const oid = (value) => {
  const parts = value.split(".").map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk = [];
    let v = part;
    do {
      chunk.unshift(v & 0x7f);
      v >>= 7;
    } while (v > 0);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i] |= 0x80;
    bytes.push(...chunk);
  }
  return tlv(0x06, new Uint8Array(bytes));
};
export const NULL = new Uint8Array([0x05, 0x00]);
export const integer = (value) => tlv(0x02, new Uint8Array([value]));
export const utcTime = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    pad(date.getUTCFullYear() % 100) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z";
  return tlv(0x17, utf8(stamp));
};
const NAME = seq(set(seq(oid("2.5.4.3"), utf8String("APP_CERTIFICATE CA Certificate"))));
const SHA256_RSA = seq(oid("1.2.840.113549.1.1.11"), NULL);

/* ------------------------------ tożsamość ------------------------------ */

const ALG = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

/** Para kluczy + samopodpisany certyfikat (20 lat), wszystko w WebCrypto. */
export async function createIdentity() {
  const keys = await crypto.subtle.generateKey(
    { name: ALG.name, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: ALG.hash },
    true,
    ["sign", "verify"]
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));

  const now = new Date();
  const later = new Date(now.getTime() + 20 * 365 * 24 * 3600 * 1000);
  const tbs = seq(
    new Uint8Array([0xa0, 0x03, 0x02, 0x01, 0x02]),
    integer(1),
    SHA256_RSA,
    NAME,
    seq(utcTime(now), utcTime(later)),
    NAME,
    spki
  );
  const signature = new Uint8Array(await crypto.subtle.sign(ALG.name, keys.privateKey, tbs));
  const certificate = seq(tbs, SHA256_RSA, tlv(0x03, concat(new Uint8Array([0]), signature)));
  const fingerprint = hex(new Uint8Array(await crypto.subtle.digest("SHA-1", certificate)));

  return {
    fingerprint,
    certificate: toBase64(certificate),
    privateKey: toBase64(pkcs8),
    publicKey: toBase64(spki),
  };
}

export async function importPrivateKey(pkcs8Base64) {
  return crypto.subtle.importKey("pkcs8", fromBase64(pkcs8Base64), ALG, false, ["sign"]);
}

/* ---------------------------- podpisywanie ---------------------------- */

/** `api/mobile/...` z parametrami, percent-encoded i małymi literami. */
export function canonicalUrl(url) {
  const match = /(api\/mobile\/.+)/.exec(url);
  if (!match) throw new Error(`Adres bez ścieżki api/mobile: ${url}`);
  const encoded = match[1].replace(/[^A-Za-z0-9\-_.~]/g, (char) => {
    const bytes = utf8(char);
    return [...bytes].map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
  });
  return encoded.toLowerCase();
}

const httpDate = (date = new Date()) => date.toUTCString().replace("UTC", "GMT");

/** Nagłówki podpisane kluczem urządzenia — ten sam schemat co aplikacja mobilna. */
export async function buildHeaders(credentials, privateKey, url, body = null, now = new Date()) {
  const canonical = canonicalUrl(url);
  const digest = body == null ? "" : toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(body))));
  const date = httpDate(now);

  const signedHeaders = ["vCanonicalUrl"];
  let signed = canonical;
  if (body != null) {
    signedHeaders.push("Digest");
    signed += digest;
  }
  signedHeaders.push("vDate");
  signed += date;

  const signature = toBase64(new Uint8Array(await crypto.subtle.sign(ALG.name, privateKey, utf8(signed))));

  const headers = {
    accept: "*/*",
    "content-type": "application/json",
    vapi: "1",
    vdate: date,
    vdevicemodel: "Xiaomi MI 9",
    vos: "Android",
    vversioncode: "621",
    vcanonicalurl: canonical,
    signature:
      `keyId="${credentials.fingerprint}",headers="${signedHeaders.join(" ")}",` +
      `algorithm="sha256withrsa",signature=Base64(sha256withrsa(${signature}))`,
  };
  if (digest) headers.digest = `SHA-256=${digest}`;
  return headers;
}

/* ------------------------------ dziennik ------------------------------ */

/** Czyta tokeny uczniów z `/api/ap` (wymaga zalogowanej sesji). */
export async function readApTokens(fetcher = fetch, origin = LOGIN_ORIGIN) {
  const response = await fetcher(`${origin}/api/ap`, { credentials: "include", redirect: "follow" });
  const html = await response.text();
  const match =
    /id=["']ap["'][^>]*?value=(["'])([\s\S]*?)\1/i.exec(html) ??
    /value=(["'])([\s\S]*?)\1[^>]*?id=["']ap["']/i.exec(html);

  if (!match) {
    if (/logowanie/i.test(html) || response.redirected) {
      throw new Error("Nie widzę sesji dziennika — zaloguj się w tej karcie i spróbuj ponownie.");
    }
    throw new Error("Nie udało się odczytać tokenów z /api/ap.");
  }

  const value = match[2].replace(/&quot;/g, '"').replace(/&#34;/g, '"');
  const json = value.trimStart().startsWith("{") ? value : text(fromBase64(value));
  const ap = JSON.parse(json);
  const tokens = Array.isArray(ap.Tokens) ? ap.Tokens.filter((token) => typeof token === "string") : [];
  if (!tokens.length) throw new Error("Tokeny są puste — zaloguj się ponownie.");
  return { tokens, name: [ap.GivenName, ap.Surname].filter(Boolean).join(" ") };
}

/** `tenant` (szkoła) z ładunku JWT. */
export function jwtTenant(token) {
  const part = String(token ?? "").split(".")[1];
  if (!part) return "";
  try {
    const payload = JSON.parse(text(fromBase64(part)));
    return typeof payload.tenant === "string" ? payload.tenant : "";
  } catch {
    return "";
  }
}

async function send(credentials, privateKey, url, { method = "GET", body = null, fetchImpl = fetch } = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  const headers = await buildHeaders(credentials, privateKey, url, payload);
  const response = await fetchImpl(url, {
    method,
    headers,
    body: payload,
    credentials: "omit",
    mode: "cors",
  });
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    /* zostawiamy null, poniżej czytelny błąd */
  }
  if (!response.ok) {
    throw new Error(`Dziennik odpowiedział HTTP ${response.status}${json?.Status?.Message ? `: ${json.Status.Message}` : ""}`);
  }
  const code = json?.Status?.Code;
  if (code !== undefined && code !== 0) {
    throw new Error(`Dziennik zwrócił błąd ${code}: ${json.Status.Message ?? ""}`);
  }
  return json?.Envelope ?? json;
}

const listOf = (envelope) => {
  if (Array.isArray(envelope)) return envelope;
  if (envelope && typeof envelope === "object") {
    for (const value of Object.values(envelope)) if (Array.isArray(value)) return value;
  }
  return [];
};

const day = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return match ? match[1] : "";
};
const clock = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
};
const words = (value, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function mapGrades(envelope) {
  return listOf(envelope).flatMap((grade) => {
    const subject = words(grade?.Column?.Subject?.Name, 60);
    const content = words(grade?.Content, 20);
    const value = /^[1-6][+-]?$/.test(content) ? content : String(Number(grade?.Value) || "");
    if (!subject || !value) return [];
    return [
      {
        externalId: String(grade.Id ?? `${subject}:${value}:${day(grade.CreatedAt ?? grade?.DateCreated?.Date)}`),
        subject,
        value,
        weight: Number(grade?.Column?.Weight) || 1,
        category: words(grade?.Column?.Category?.Name, 60) || undefined,
        date: day(grade.CreatedAt ?? grade?.DateCreated?.Date) || undefined,
        comment: words(grade.Comment) || undefined,
      },
    ];
  });
}

export function mapTimetable(envelope) {
  return listOf(envelope).flatMap((lesson) => {
    if (lesson?.Visible === false) return [];
    const date = day(lesson.DateAt);
    const start = clock(lesson?.TimeSlot?.Start);
    const end = clock(lesson?.TimeSlot?.End);
    const subject = words(lesson?.Subject?.Name, 60);
    if (!date || !start || !end || !subject) return [];
    return [
      {
        date,
        start,
        end,
        subject,
        room: words(lesson?.Room?.Code, 20) || undefined,
        canceled: Number(lesson?.Change?.Type) === 1 || undefined,
      },
    ];
  });
}

export function mapExams(envelope) {
  return listOf(envelope).flatMap((exam) => {
    const subject = words(exam?.Subject?.Name, 60);
    const date = day(exam.DeadlineAt ?? exam?.Deadline?.Date);
    if (!subject || !date) return [];
    return [
      {
        externalId: String(exam.Id ?? `${subject}:${date}`),
        subject,
        date,
        type: words(exam.Type, 40) || "sprawdzian",
        description: words(exam.Content) || undefined,
      },
    ];
  });
}

export function mapHomework(envelope) {
  return listOf(envelope).flatMap((homework) => {
    const subject = words(homework?.Subject?.Name, 60);
    const due = day(homework.DeadlineAt ?? homework?.Deadline?.Date);
    const description = words(homework.Content);
    if (!subject || !due || !description) return [];
    return [{ externalId: String(homework.Id ?? `${subject}:${due}`), subject, due, description }];
  });
}

const isoDay = (date) => date.toISOString().slice(0, 10);

export function buildSnapshot({ grades, timetable, exams, homework, student, exportedAt = new Date().toISOString() }) {
  return {
    format: "plecak-import",
    version: 1,
    source: "eduvulcan",
    exportedAt,
    ...(student ? { student } : {}),
    grades,
    timetable,
    exams,
    homework,
  };
}

/* ------------------------------- przepływ ------------------------------ */

/**
 * Rejestruje urządzenie (raz) i zwraca dane do podpisywania.
 * @returns {Promise<{credentials: object, pupil: object}>}
 */
export async function pairDevice({ tokens, origin = API_HOST, fetchImpl = fetch, identityFactory = createIdentity }) {
  const tenants = [...new Set(tokens.map(jwtTenant).filter(Boolean))];
  if (!tenants.length) throw new Error("Nie udało się odczytać szkoły z tokenów.");

  const identity = await identityFactory();
  const credentials = {
    fingerprint: identity.fingerprint,
    certificate: identity.certificate,
    privateKey: identity.privateKey,
  };
  const privateKey = await importPrivateKey(credentials.privateKey);

  const now = new Date();
  const body = {
    AppName: "DzienniczekPlus 3.0",
    AppVersion: "25.02.14 (G)",
    Envelope: {
      OS: "Android",
      DeviceModel: "Xiaomi MI 9",
      Certificate: credentials.certificate,
      CertificateType: "X509",
      CertificateThumbprint: credentials.fingerprint,
      Tokens: tokens,
      selfIdentifier: crypto.randomUUID(),
    },
    NotificationToken: "",
    API: 1,
    RequestId: crypto.randomUUID(),
    Timestamp: Math.floor(now.getTime() / 1000),
    TimestampFormatted: now.toISOString().slice(0, 19).replace("T", " "),
  };

  const restUrls = [];
  for (const tenant of tenants) {
    const envelope = await send(credentials, privateKey, `${origin}/${tenant}/api/mobile/register/jwt`, {
      method: "POST",
      body,
      fetchImpl,
    });
    if (envelope?.RestURL) restUrls.push(envelope.RestURL);
  }

  const candidates = restUrls.length ? [...new Set(restUrls)] : tenants.map((tenant) => `${origin}/${tenant}`);
  for (const restUrl of candidates) {
    try {
      const pupils = listOf(
        await send(credentials, privateKey, `${restUrl}/api/mobile/register/hebe?mode=2`, { fetchImpl })
      );
      if (pupils.length) {
        return { credentials: { ...credentials, restUrl, pupil: pupils[0] }, privateKey };
      }
    } catch {
      /* próbujemy następny adres */
    }
  }
  throw new Error("Dziennik przyjął klucz, ale nie zwrócił danych ucznia.");
}

/**
 * Pobiera wszystko, co trafia do Plecaka.
 * Plan bierzemy z okna [-14, +21] dni — pełny rok nie zmieściłby się w adresie.
 */
export async function fetchSnapshot(credentials, privateKey, { fetchImpl = fetch, now = new Date() } = {}) {
  const periods = credentials.pupil?.Periods ?? [];
  const period = periods.find((item) => item.Current) ?? periods[periods.length - 1];
  const unitId = credentials.pupil?.Unit?.Id;
  const pupilId = credentials.pupil?.Pupil?.Id;

  const call = (path, params = {}) => {
    const query = new URLSearchParams(
      Object.entries({ unitId, pupilId, ...params }).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ).toString();
    return send(credentials, privateKey, `${credentials.restUrl}/api/mobile/${path}${query ? `?${query}` : ""}`, { fetchImpl });
  };

  const from = new Date(now.getTime() - 14 * 864e5);
  const to = new Date(now.getTime() + 21 * 864e5);
  const yearFrom = credentials.pupil?.Journal?.StartAt ?? isoDay(from);
  const yearTo = credentials.pupil?.Journal?.EndAt ?? isoDay(to);

  const [grades, timetable, exams, homework] = await Promise.all([
    call("grade/byPupil", { periodId: period?.Id, pageSize: 500 }).catch(() => []),
    call("schedule/withchanges/byPupil", {
      periodId: period?.Id,
      dateFrom: isoDay(from),
      dateTo: isoDay(to),
      pageSize: 1000,
    }).catch(() => []),
    call("exam/byPupil", { dateFrom: yearFrom, dateTo: yearTo, pageSize: 500 }).catch(() => []),
    call("homework/byPupil", { dateFrom: yearFrom, dateTo: yearTo, pageSize: 500 }).catch(() => []),
  ]);

  const pupil = credentials.pupil ?? {};
  const student = {
    name: [pupil?.Pupil?.FirstName, pupil?.Pupil?.Surname].filter(Boolean).join(" ") || undefined,
    className: pupil?.ClassDisplay || undefined,
    school: pupil?.Unit?.DisplayName || pupil?.Unit?.Name || undefined,
  };

  return buildSnapshot({
    grades: mapGrades(grades),
    timetable: mapTimetable(timetable),
    exams: mapExams(exams),
    homework: mapHomework(homework),
    student,
    exportedAt: now.toISOString(),
  });
}

/* --------------------------------- UI --------------------------------- */

const STYLE = `
:host{all:initial}
.box{position:fixed;z-index:2147483647;right:20px;bottom:20px;width:min(92vw,26rem);
font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b1e2b;
background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(16,18,30,.28);
border:1px solid #e3e2dc;overflow:hidden}
.head{display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid #eeece4;font-weight:650}
.head .dot{width:9px;height:9px;border-radius:50%;background:#c9a227;flex:none}
.head .dot.ok{background:#5f8b6a}.head .dot.err{background:#b4553f}
.body{padding:14px 16px;max-height:52vh;overflow:auto}
.body p{margin:0 0 10px}
.body b{font-weight:650}
.muted{color:#6d7180;font-size:12.5px}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
button{font:inherit;font-weight:600;cursor:pointer;border-radius:11px;padding:9px 14px;border:0}
.primary{background:#1b1e2b;color:#fff}
.ghost{background:#f2f1ec;color:#1b1e2b}
a{color:#3f6b4c}
.steps{margin:0;padding-left:18px}
.steps li{margin-bottom:6px}
`;

function overlay() {
  // Jedno okienko na stronę — kolejne kliknięcia zakładki podmieniają treść,
  // a nie dokładają nowych paneli.
  document.querySelectorAll("#plecak-sync-ui").forEach((old) => old.remove());

  const host = document.createElement("div");
  host.id = "plecak-sync-ui";
  host.style.cssText = "position:fixed;inset:0;pointer-events:none";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const box = document.createElement("div");
  box.className = "box";
  box.style.pointerEvents = "auto";
  root.append(style, box);
  document.documentElement.append(host);

  const render = (state) => {
    const dot = state.status === "ok" ? "dot ok" : state.status === "err" ? "dot err" : "dot";
    box.innerHTML = `
      <div class="head"><span class="${dot}"></span><span>${state.title}</span></div>
      <div class="body">${state.html}</div>`;
    box.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", () => state.actions?.[element.dataset.action]?.());
    });
  };

  return { render, close: () => host.remove() };
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function plecakLink(snapshot) {
  return `${PLECAK_URL}#dziennik=${toBase64Url(JSON.stringify(snapshot))}`;
}

/* -------------------------------- start ------------------------------- */

const hostname = () => (typeof location !== "undefined" ? location.hostname : "");
const isJournalPage = () => /(^|\.)eduvulcan\.pl$/.test(hostname()) || /vulcan\.net\.pl$/.test(hostname());

export async function run(options = {}) {
  const ui = options.ui ?? overlay();
  const storage = options.storage ?? window.localStorage;
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));

  const step = (title, html, actions, status) => ui.render({ title, html, actions, status });

  if (!isJournalPage() && !options.force) {
    step(
      "Otwórz to na stronie dziennika",
      `<p>Ta zakładka działa tylko na <b>eduvulcan.pl</b> — potrzebuje Twojej zalogowanej sesji.</p>
       <div class="row"><button class="primary" data-action="go">Otwórz eduVULCAN</button>
       <button class="ghost" data-action="close">Zamknij</button></div>`,
      { go: () => window.open(`${LOGIN_ORIGIN}/`, "_blank"), close: () => ui.close() },
      "err"
    );
    return null;
  }

  try {
    step("Łączę się z dziennikiem…", "<p>Odczytuję sesję i sprawdzam, czy urządzenie jest już sparowane.</p>");

    const saved = storage.getItem(STORAGE_KEY);
    let credentials = saved ? JSON.parse(saved) : null;
    let privateKey = null;

    if (credentials) {
      privateKey = await importPrivateKey(credentials.privateKey);
    } else {
      step("Parowanie urządzenia (jednorazowo)…", "<p>Generuję klucz i rejestruję go w dzienniku.</p>");
      const { tokens } = await readApTokens(fetchImpl);
      const paired = await pairDevice({ tokens, fetchImpl });
      credentials = paired.credentials;
      privateKey = paired.privateKey;
      storage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    }

    step("Pobieram dane…", "<p>Oceny, plan lekcji, sprawdziany i zadania domowe.</p>");
    const snapshot = await fetchSnapshot(credentials, privateKey, { fetchImpl });

    const counts = [
      `${snapshot.grades.length} ocen`,
      `${snapshot.timetable.length} lekcji`,
      `${snapshot.exams.length} sprawdzianów`,
      `${snapshot.homework.length} zadań`,
    ].join(" · ");

    if (!snapshot.grades.length && !snapshot.timetable.length && !snapshot.exams.length && !snapshot.homework.length) {
      step("Dziennik nie zwrócił danych", `<p class="muted">${escapeHtml(counts)}</p>`, { close: () => ui.close() }, "err");
      return snapshot;
    }

    const link = plecakLink(snapshot);
    if (link.length > MAX_URL) {
      step(
        "Dane są zbyt duże na adres",
        `<p class="muted">${escapeHtml(counts)}</p><p>Otwórz Plecak i wklej dane ręcznie.</p>`,
        { open: () => window.open(PLECAK_URL, "_blank"), close: () => ui.close() },
        "err"
      );
      return snapshot;
    }

    step(
      "Gotowe",
      `<p><b>${escapeHtml(counts)}</b></p>
       <p class="muted">Sparowano: ${escapeHtml(credentials.pupil?.Pupil?.FirstName ?? "uczeń")} · dane zostaną pokazane w Plecaku do zatwierdzenia.</p>
       <div class="row"><button class="primary" data-action="open">Otwórz w Plecaku</button>
       <button class="ghost" data-action="close">Zamknij</button></div>`,
      { open: () => window.open(link, "_blank"), close: () => ui.close() },
      "ok"
    );

    if (options.open !== false) window.open(link, "_blank");
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cors = /failed to fetch|networkerror|load failed/i.test(message);
    step(
      "Nie udało się pobrać danych",
      `<p>${escapeHtml(message)}</p>
       ${
         cors
           ? `<p class="muted">Dziennik zablokował zapytanie z tej strony (CORS). W tej sytuacji pozostaje import pliku — instrukcja w Plecaku.</p>`
           : `<p class="muted">Sprawdź, czy jesteś zalogowany w tej karcie, i spróbuj ponownie.</p>`
       }
       <div class="row"><button class="primary" data-action="retry">Spróbuj ponownie</button>
       <button class="ghost" data-action="reset">Wyczyść parowanie</button>
       <button class="ghost" data-action="close">Zamknij</button></div>`,
      {
        retry: () => {
          ui.close();
          void run(options);
        },
        reset: () => {
          storage.removeItem(STORAGE_KEY);
          ui.close();
          void run(options);
        },
        close: () => ui.close(),
      },
      "err"
    );
    return null;
  }
}

if (typeof window !== "undefined" && !window.__plecakSyncLoaded && isJournalPage()) {
  window.__plecakSyncLoaded = true;
  void run();
  window.__plecakSync = { run };
}
