/**
 * Jednorazowe parowanie urządzenia z eduVULCAN.
 *
 * Dokładnie ten sam protokół, którego używa oficjalna aplikacja:
 *  1. logujesz się w przeglądarce na eduvulcan.pl,
 *  2. otwierasz https://eduvulcan.pl/api/ap i kopiujesz tokeny,
 *  3. agent generuje parę kluczy i certyfikat (20 lat ważności),
 *  4. `POST /api/mobile/register/jwt` — dziennik zapamiętuje klucz,
 *  5. `register/hebe?mode=2` — pobiera dane ucznia i `restUrl`.
 *
 * Po tym kroku hasło nie jest już potrzebne: każde żądanie jest podpisane
 * kluczem prywatnym, który zostaje wyłącznie na tym komputerze.
 */

import { request } from "node:https";
import { randomUUID } from "node:crypto";
import { VulcanClient, buildHeaders } from "./vulcan.mjs";
import { createIdentity, identityToCredentials } from "./cert.mjs";

const LOGIN_URL = "https://eduvulcan.pl/logowania";
const AP_URL = "https://eduvulcan.pl/api/ap";
const BASE_URL = "https://lekcjaplus.vulcan.net.pl";
const APP_NAME = "DzienniczekPlus 3.0";
const APP_VERSION = "25.02.14 (G)";

/** Wyciąga JSON z `<input id="ap" value="…">` albo przyjmuje wklejony JSON. */
export function parseAp(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("Brak danych do odczytania.");
  if (raw.startsWith("{")) return JSON.parse(raw);

  const unescape = (value) =>
    value
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  // Wartość atrybutu może zawierać &quot;, więc dopasowujemy do tego samego
  // cudzysłowu, którym atrybut otwarto (a nie do pierwszego napotkanego).
  const patterns = [
    /id=["']ap["'][^>]*?value=(["'])([\s\S]*?)\1/i,
    /value=(["'])([\s\S]*?)\1[^>]*?id=["']ap["']/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    if (match) {
      const value = unescape(match[2]);
      const json = value.trimStart().startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
      return JSON.parse(json);
    }
  }
  throw new Error('Nie znalazłem <input id="ap">. Skopiuj całą treść strony https://eduvulcan.pl/api/ap.');
}

/** `tenant` z ładunku JWT (tak robi oficjalna aplikacja). */
export function jwtTenant(token) {
  const part = String(token ?? "").split(".")[1];
  if (!part) return "";
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof payload.tenant === "string" ? payload.tenant : "";
  } catch {
    return "";
  }
}

const postJson = (url, headers, body) =>
  new Promise((resolve, reject) => {
    const req = request(url, { method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Rejestracja nie powiodła się: HTTP ${res.statusCode} ${raw.slice(0, 300)}`));
          return;
        }
        let json;
        try {
          json = JSON.parse(raw);
        } catch {
          reject(new Error(`Rejestracja: odpowiedź nie jest JSON-em: ${raw.slice(0, 200)}`));
          return;
        }
        if (json?.Status?.Code !== undefined && json.Status.Code !== 0) {
          reject(new Error(`Rejestracja: ${json.Status.Code} ${json.Status.Message ?? ""}`));
          return;
        }
        resolve(json?.Envelope ?? json);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

/**
 * Pełne parowanie na podstawie treści `/api/ap`.
 * @returns {Promise<{credentials: object, pupil: object}>}
 */
export async function registerDevice(apInput, { log = () => {} } = {}) {
  const ap = parseAp(apInput);
  const tokens = Array.isArray(ap.Tokens) ? ap.Tokens.filter((token) => typeof token === "string") : [];
  if (!tokens.length) throw new Error("W danych z /api/ap nie ma tokenów — zaloguj się ponownie.");

  const tenants = [...new Set(tokens.map(jwtTenant).filter(Boolean))];
  if (!tenants.length) throw new Error("Nie udało się odczytać szkoły (tenant) z tokenów.");
  log(`Szkoła: ${tenants.join(", ")}`);

  const identity = createIdentity();
  const credentials = identityToCredentials(identity);
  log(`Wygenerowano klucz, fingerprint ${credentials.fingerprint.slice(0, 16)}…`);

  const now = new Date();
  const body = JSON.stringify({
    AppName: APP_NAME,
    AppVersion: APP_VERSION,
    Envelope: {
      OS: "Android",
      DeviceModel: "Xiaomi MI 9",
      Certificate: credentials.certificate,
      CertificateType: "X509",
      CertificateThumbprint: credentials.fingerprint,
      Tokens: tokens,
      selfIdentifier: randomUUID(),
    },
    NotificationToken: "",
    API: 1,
    RequestId: randomUUID(),
    Timestamp: Math.floor(now.getTime() / 1000),
    TimestampFormatted: now.toISOString().slice(0, 19).replace("T", " "),
  });

  const restUrls = [];
  for (const tenant of tenants) {
    const url = `${BASE_URL}/${tenant}/api/mobile/register/jwt`;
    log(`Rejestruję urządzenie w ${tenant}…`);
    const envelope = await postJson(url, buildHeaders(credentials, url, body), body);
    if (envelope?.RestURL) restUrls.push(envelope.RestURL);
    if (Array.isArray(envelope?.RestURLs)) restUrls.push(...envelope.RestURLs);
  }

  const candidates = restUrls.length ? [...new Set(restUrls)] : tenants.map((tenant) => `${BASE_URL}/${tenant}`);
  let pupil = null;
  let restUrl = null;
  for (const candidate of candidates) {
    try {
      const client = new VulcanClient({ credentials: { ...credentials, restUrl: candidate, pupil: {} } });
      const pupils = await client.get("register/hebe", { mode: 2 });
      const list = Array.isArray(pupils) ? pupils : [];
      if (list.length) {
        pupil = list[0];
        restUrl = candidate;
        break;
      }
    } catch (error) {
      log(`  ${candidate} → ${error.message}`);
    }
  }

  if (!pupil || !restUrl) {
    throw new Error("Dziennik przyjął klucz, ale nie zwrócił danych ucznia. Spróbuj ponownie za chwilę.");
  }

  log(`Uczeń: ${pupil?.Pupil?.FirstName ?? ""} ${pupil?.Pupil?.Surname ?? ""}`.trim());
  return { credentials: { ...credentials, restUrl, pupil }, pupil };
}

export { LOGIN_URL, AP_URL };
