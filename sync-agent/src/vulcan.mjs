import { createHash, createPrivateKey, createSign } from "node:crypto";
import { request } from "node:https";
import { URL } from "node:url";

/**
 * Klient API mobilnego eduVULCAN (Hebe).
 *
 * Protokół odtworzony z publicznych, działających klientów (VulcanScope/hebece):
 *  - adres: `{restUrl}/{symbol}/api/mobile/{zasób}`,
 *  - każde żądanie podpisane kluczem RSA z parowania,
 *  - podpisywany jest kanoniczny adres (`api/mobile/...` z parametrami,
 *    percent-encoded i małymi literami), opcjonalny digest treści i data.
 *
 * Uwaga: to API nieoficjalne. Vulcan może je zmienić w każdej chwili —
 * dlatego agent ma jawny status i nie udaje, że dane są świeże.
 */

export class VulcanError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "VulcanError";
    this.status = status;
    this.body = body;
  }
}

/** Odpowiednik Pythona `quote(value, safe="")` + `lower()`. */
export function canonicalUrl(url) {
  const match = /(api\/mobile\/.+)/.exec(url);
  if (!match) throw new VulcanError(`Adres nie zawiera ścieżki api/mobile/: ${url}`);
  const percentEncoded = match[1].replace(/[^A-Za-z0-9\-_.~]/g, (char) => {
    const bytes = Buffer.from(char, "utf8");
    return [...bytes].map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
  });
  return percentEncoded.toLowerCase();
}

/** Data w formacie RFC 1123 (GMT), jakiej oczekuje dziennik. */
export function httpDate(date = new Date()) {
  return date.toUTCString().replace("UTC", "GMT");
}

const digestOf = (body) => (body === null || body === undefined ? "" : createHash("sha256").update(body).digest("base64"));

/**
 * Buduje nagłówki podpisane kluczem z `credentials.json`.
 *
 * @param {object} credentials `{ fingerprint, privateKey }` (privateKey = base64 PKCS#8 DER)
 * @param {string} url pełny adres żądania
 * @param {string|null} body treść (tylko dla POST)
 */
export function buildHeaders(credentials, url, body = null, now = new Date()) {
  const canonical = canonicalUrl(url);
  const digest = digestOf(body);
  const date = httpDate(now);

  let signed = canonical;
  const headers = ["vCanonicalUrl"];
  if (body !== null && body !== undefined) {
    headers.push("Digest");
    signed += digest;
  }
  headers.push("vDate");
  signed += date;

  const key = createPrivateKey({
    key: Buffer.from(credentials.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const signer = createSign("sha256");
  signer.update(signed, "utf8");
  const signature = signer.sign(key).toString("base64");

  const out = {
    accept: "*/*",
    "accept-charset": "UTF-8",
    "content-type": "application/json",
    host: new URL(url).host,
    "user-agent": "Dart/3.3 (dart:io)",
    vapi: "1",
    vdate: date,
    vdevicemodel: "Xiaomi MI 9",
    vos: "Android",
    vversioncode: "621",
    vcanonicalurl: canonical,
    signature:
      `keyId="${credentials.fingerprint}",headers="${headers.join(" ")}",` +
      `algorithm="sha256withrsa",signature=Base64(sha256withrsa(${signature}))`,
  };
  if (digest) out.digest = `SHA-256=${digest}`;
  return out;
}

export class VulcanClient {
  /**
   * @param {object} options
   * @param {object} options.credentials `{ fingerprint, privateKey, restUrl, pupil }`
   */
  constructor({ credentials, timeoutMs = 30000 }) {
    if (!credentials?.privateKey) throw new VulcanError("credentials.json nie zawiera klucza prywatnego");
    if (!credentials?.restUrl) throw new VulcanError("credentials.json nie zawiera restUrl");
    this.credentials = credentials;
    this.restUrl = credentials.restUrl.replace(/\/+$/, "");
    this.symbol = credentials.pupil?.Unit?.Symbol;
    this.unitId = credentials.pupil?.Unit?.Id;
    this.pupilId = credentials.pupil?.Pupil?.Id;
    this.timeoutMs = timeoutMs;
  }

  get(path, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      query.set(key, String(value));
    }
    const search = query.toString();
    const url = `${this.restUrl}/${this.symbol}/api/mobile/${path}${search ? `?${search}` : ""}`;
    return this.send("GET", url);
  }

  send(method, url, body = null) {
    // Serializujemy dokładnie raz — ten sam tekst idzie i do podpisu, i do gniazda.
    const bodyText = body === null || body === undefined ? null : JSON.stringify(body);
    const headers = buildHeaders(this.credentials, url, bodyText);
    if (bodyText) headers["content-length"] = Buffer.byteLength(bodyText);

    return new Promise((resolve, reject) => {
      const req = request(url, { method, headers, timeout: this.timeoutMs }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode >= 400) {
            reject(
              new VulcanError(`Dziennik odpowiedział HTTP ${res.statusCode}`, {
                status: res.statusCode,
                body: text.slice(0, 500),
              })
            );
            return;
          }
          let json;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            reject(new VulcanError("Odpowiedź dziennika nie jest JSON-em", { body: text.slice(0, 500) }));
            return;
          }
          const code = json?.Status?.Code;
          if (code !== undefined && code !== 0) {
            reject(new VulcanError(`Dziennik zwrócił błąd ${code}: ${json.Status.Message ?? ""}`, { body: text.slice(0, 500) }));
            return;
          }
          resolve(json?.Envelope ?? json);
        });
      });
      req.on("timeout", () => req.destroy(new VulcanError("Przekroczono czas oczekiwania na dziennik")));
      req.on("error", (error) => reject(error instanceof VulcanError ? error : new VulcanError(error.message)));
      if (bodyText) req.write(bodyText);
      req.end();
    });
  }

  // --- zasoby czytane przez synchronizację -------------------------------

  currentPeriod() {
    const periods = this.credentials.pupil?.Periods ?? [];
    return periods.find((period) => period.Current) ?? periods[periods.length - 1];
  }

  yearRange() {
    const journal = this.credentials.pupil?.Journal ?? {};
    const periods = this.credentials.pupil?.Periods ?? [];
    const first = periods[0];
    const last = periods[periods.length - 1];
    return {
      from: journal.StartAt ?? first?.StartAt ?? first?.Start?.Date,
      to: journal.EndAt ?? last?.EndAt ?? last?.End?.Date,
    };
  }

  grades(periodId) {
    return this.get("grade/byPupil", { unitId: this.unitId, pupilId: this.pupilId, periodId, pageSize: 500 });
  }

  timetable(periodId) {
    const { from, to } = this.yearRange();
    return this.get("schedule/withchanges/byPupil", {
      unitId: this.unitId,
      pupilId: this.pupilId,
      periodId,
      dateFrom: from,
      dateTo: to,
      pageSize: 1000,
    });
  }

  exams() {
    const { from, to } = this.yearRange();
    return this.get("exam/byPupil", {
      unitId: this.unitId,
      pupilId: this.pupilId,
      dateFrom: from,
      dateTo: to,
      pageSize: 500,
    });
  }

  homework() {
    const { from, to } = this.yearRange();
    return this.get("homework/byPupil", {
      unitId: this.unitId,
      pupilId: this.pupilId,
      dateFrom: from,
      dateTo: to,
      pageSize: 500,
    });
  }
}
