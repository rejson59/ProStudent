// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { COMMUNITY_SESSION_KEY } from "../lib/communityAccount";

const token = "t".repeat(48);
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const set = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
beforeEach(() => {
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("community_whoami") ? json({ username: "Rejson" }) : json({ token, username: "bad-local-name" })));
  localStorage.clear();
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("konto w Plecaku", () => {
  it("opens from the real app, logs in without changing school data and logs out", async () => {
    localStorage.setItem("plecak:grades", '[{"subject":"Matematyka","value":5}]');
    await act(async () => root.render(<App />));
    const original = localStorage.getItem("plecak:grades");
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Konto Rejson"]')!;
    expect(button).toBeTruthy();
    await act(async () => button.click());
    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="community-title"]')!;
    expect(dialog.textContent).toMatch(/nie przenosi/);
    const fields = dialog.querySelectorAll<HTMLInputElement>("input");
    await act(async () => { set(fields[0], "Rejson"); set(fields[1], "1234"); });
    await act(async () => { dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(dialog.textContent).toContain("Zalogowano jako Rejson");
    expect(localStorage.getItem(COMMUNITY_SESSION_KEY)).not.toContain("1234");
    expect(localStorage.getItem("plecak:grades")).toBe(original);
    const logout = [...dialog.querySelectorAll("button")].find((item) => item.textContent?.includes("Wyloguj na tym urządzeniu"))!;
    await act(async () => logout.click());
    expect(localStorage.getItem(COMMUNITY_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem("plecak:grades")).toBe(original);
  });
  it("does not claim authentication or erase data when the service is offline", async () => {
    localStorage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify({ token, username: "FakeName" }));
    localStorage.setItem("plecak:tasks", '[{"title":"Nie usuwać"}]');
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await act(async () => root.render(<App />));
    const original = localStorage.getItem("plecak:tasks");
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Konto Rejson"]')!.click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="community-title"]')!;
    expect(dialog.textContent).toContain("Nie można teraz sprawdzić konta");
    expect(dialog.textContent).not.toContain("Zalogowano jako FakeName");
    expect(localStorage.getItem(COMMUNITY_SESSION_KEY)).toContain(token);
    expect(localStorage.getItem("plecak:tasks")).toBe(original);
  });
});
