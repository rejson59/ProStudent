/**
 * Minimalny koder DER — tyle, ile potrzeba na samopodpisany certyfikat X.509.
 * Bez zależności: Node ma `crypto`, ale nie umie tworzyć certyfikatów.
 */

export function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

export const seq = (...items) => tlv(0x30, Buffer.concat(items));
export const set = (...items) => tlv(0x31, Buffer.concat(items));
export const utf8 = (value) => tlv(0x0c, Buffer.from(value, "utf8"));
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
  return tlv(0x17, Buffer.from(stamp, "ascii"));
};

export function integer(value) {
  if (typeof value === "number") {
    const bytes = [];
    let v = value;
    do {
      bytes.unshift(v & 0xff);
      v >>= 8;
    } while (v > 0);
    if (bytes[0] & 0x80) bytes.unshift(0);
    return tlv(0x02, Buffer.from(bytes));
  }
  const trimmed = value[0] & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value;
  return tlv(0x02, trimmed);
}

export function oid(value) {
  const parts = value.split(".").map(Number);
  const first = 40 * parts[0] + parts[1];
  const bytes = [first];
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
  return tlv(0x06, Buffer.from(bytes));
}

export const NULL = Buffer.from([0x05, 0x00]);

/** Name ::= SEQUENCE OF RDN (SET OF AttributeTypeAndValue). */
export const name = (commonName) => seq(set(seq(oid("2.5.4.3"), utf8(commonName))));
