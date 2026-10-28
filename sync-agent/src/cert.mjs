import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { integer, name, NULL, oid, seq, tlv, utcTime } from "./der.mjs";

const SHA256_RSA = "1.2.840.113549.1.1.11";

/**
 * Para kluczy + samopodpisany certyfikat — odpowiednik tego, co robi oficjalna
 * aplikacja przy parowaniu urządzenia. Vulcan przechowuje certyfikat i
 * weryfikuje nim podpisy kolejnych żądań.
 */
export function createIdentity(commonName = "APP_CERTIFICATE CA Certificate", days = 365 * 20) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicExponent: 0x10001 });

  const spki = publicKey.export({ type: "spki", format: "der" });
  const now = new Date();
  const notAfter = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const algorithm = seq(oid(SHA256_RSA), NULL);
  const tbs = seq(
    Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]), // version: v3
    integer(1),
    algorithm,
    name(commonName),
    seq(utcTime(now), utcTime(notAfter)),
    name(commonName),
    spki
  );

  const signature = sign("sha256", tbs, privateKey);
  // BIT STRING: wiodący bajt 0x00 (brak nieużywanych bitów) + podpis.
  const bitString = tlv(0x03, Buffer.concat([Buffer.from([0x00]), signature]));
  const certificate = seq(tbs, algorithm, bitString);

  const fingerprint = createHash("sha1").update(certificate).digest("hex");

  return {
    fingerprint,
    privateKeyDer: privateKey.export({ type: "pkcs8", format: "der" }),
    publicKeyDer: spki,
    certificateDer: certificate,
    privateKey,
  };
}

/** Format zapisu zgodny z `credentials.json` innych narzędzi (base64 DER). */
export function identityToCredentials(identity) {
  return {
    fingerprint: identity.fingerprint,
    privateKey: identity.privateKeyDer.toString("base64"),
    certificate: identity.certificateDer.toString("base64"),
  };
}

/** Certyfikat w PEM — do podejrzenia przez `openssl x509 -text`. */
export function toPem(der) {
  const base64 = der.toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}
