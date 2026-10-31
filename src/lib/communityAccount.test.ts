import { describe, expect, it } from "vitest";
import { authenticateCommunity, readCommunitySession, validCredentials, verifyCommunitySession } from "./communityAccount";

const token = "x".repeat(48);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
describe("wspólne konto", () => {
  it("allows existing PIN login but requires a password for new accounts", () => {
    expect(validCredentials("login", "Rejson", "1234")).toBe(true);
    expect(validCredentials("register", "Rejson", "1234")).toBe(false);
    expect(validCredentials("register", "Rejson", "Dobre haslo123")).toBe(true);
    expect(validCredentials("register", "Rejson", "ą".repeat(37))).toBe(false);
    expect(validCredentials("login", "../konto", "1234")).toBe(false);
  });
  it("uses existing RPCs and accepts identity only from whoami", async () => {
    for (const mode of ["login", "register"] as const) {
      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      const request = (async (url: string | URL | Request, init?: RequestInit) => {
        const text = String(url);
        calls.push({ url: text, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return text.endsWith("community_whoami") ? json({ username: "Rejson" }) : json({ token, username: "fake" });
      }) as typeof fetch;
      expect(await authenticateCommunity(mode, " Rejson ", "dlugie haslo 123", request)).toEqual({ token, username: "Rejson" });
      expect(calls[0].url.endsWith(mode === "login" ? "community_login" : "community_register")).toBe(true);
      expect(calls[0].body).toEqual({ p_username: "Rejson", p_pin: "dlugie haslo 123" });
      expect(calls[1].body).toEqual({ p_token: token });
      expect(calls.every(({ url }) => !url.includes("haslo") && !url.includes(token))).toBe(true);
    }
  });
  it("fails closed on invalid response, expired session, and offline", async () => {
    expect(await verifyCommunitySession({ token, username: "fake" }, (async () => json({ username: null })) as typeof fetch)).toBeNull();
    await expect(verifyCommunitySession({ token, username: "fake" }, (async () => json({})) as typeof fetch)).rejects.toThrow();
    await expect(verifyCommunitySession({ token, username: "fake" }, (async () => { throw new Error("offline"); }) as typeof fetch)).rejects.toThrow(/Nie udało się połączyć/);
    expect(readCommunitySession({ getItem: () => "broken" })).toBeNull();
    let calls = 0;
    const partial = (async () => ++calls === 1 ? json({ token, username: "Rejson" }) : json({}, 503)) as typeof fetch;
    await expect(authenticateCommunity("register", "Rejson", "dlugie haslo 123", partial)).rejects.toThrow(/Konto utworzono/);
  });
});
