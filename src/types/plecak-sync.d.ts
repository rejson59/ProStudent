/**
 * Typy dla mostu uruchamianego na stronie dziennika (`public/plecak-sync.js`).
 * Plik jest czystym JavaScriptem, bo trafia do przeglądarki bez budowania.
 */
declare module "*plecak-sync.js" {
  export type BridgeIdentity = {
    fingerprint: string;
    certificate: string;
    privateKey: string;
    publicKey: string;
  };

  export type BridgeCredentials = {
    fingerprint: string;
    certificate: string;
    privateKey: string;
    restUrl?: string;
    pupil?: {
      Pupil?: { FirstName?: string; Surname?: string; Id?: number };
      Unit?: { Id?: number; Symbol?: string; DisplayName?: string; Name?: string };
      ClassDisplay?: string;
      Periods?: { Id?: number; Current?: boolean }[];
      Journal?: { StartAt?: string; EndAt?: string };
    };
  };

  export const canonicalUrl: (url: string) => string;
  export const toBase64: (bytes: Uint8Array) => string;
  export const fromBase64: (value: string) => Uint8Array;
  export const toBase64Url: (value: string) => string;
  export const createIdentity: () => Promise<BridgeIdentity>;
  export const importPrivateKey: (pkcs8Base64: string) => Promise<CryptoKey>;
  export const buildHeaders: (
    credentials: BridgeCredentials,
    privateKey: CryptoKey,
    url: string,
    body?: string | null,
    now?: Date
  ) => Promise<Record<string, string>>;
  export const readApTokens: (
    fetcher?: typeof fetch,
    origin?: string
  ) => Promise<{ tokens: string[]; name: string }>;
  export const jwtTenant: (token: string) => string;
  export const mapGrades: (envelope: unknown) => unknown[];
  export const mapTimetable: (envelope: unknown) => unknown[];
  export const mapExams: (envelope: unknown) => unknown[];
  export const mapHomework: (envelope: unknown) => unknown[];
  export const buildSnapshot: (input: Record<string, unknown>) => unknown;
  export const pairDevice: (options: {
    tokens: string[];
    origin?: string;
    fetchImpl?: typeof fetch;
    identityFactory?: () => Promise<BridgeIdentity>;
  }) => Promise<{ credentials: BridgeCredentials; privateKey: CryptoKey }>;
  export const fetchSnapshot: (
    credentials: BridgeCredentials,
    privateKey: CryptoKey,
    options?: { fetchImpl?: typeof fetch; now?: Date }
  ) => Promise<unknown>;
}
