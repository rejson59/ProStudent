import { describe, expect, it } from "vitest";
import { readLaunchIntent, readSharedPayload, sharedPayloadToTask } from "./mobile";

describe("skróty z ekranu głównego", () => {
  it("otwiera wskazaną zakładkę", () => {
    expect(readLaunchIntent("?zakladka=tasks")).toEqual({ kind: "tab", tab: "tasks" });
    expect(readLaunchIntent("?zakladka=plan")).toEqual({ kind: "tab", tab: "plan" });
    expect(readLaunchIntent("?zakladka=grades")).toEqual({ kind: "tab", tab: "grades" });
  });

  it("otwiera import z dziennika", () => {
    expect(readLaunchIntent("?akcja=dziennik")).toEqual({ kind: "journal" });
    expect(readLaunchIntent("?akcja=import")).toEqual({ kind: "import" });
  });

  it("ignoruje nieznane i puste parametry", () => {
    expect(readLaunchIntent("")).toBeNull();
    expect(readLaunchIntent("?zakladka=nieistnieje")).toBeNull();
    expect(readLaunchIntent("?zakladka=zadania")).toBeNull();
    expect(readLaunchIntent("?akcja=cokolwiek")).toBeNull();
  });
});

describe("„Udostępnij” z innej aplikacji", () => {
  it("czyta tytuł, treść i adres", () => {
    const payload = readSharedPayload(new URLSearchParams("title=Sprawdzian&text=Kinematyka&url=https%3A%2F%2Fexample.com"));
    expect(payload).toEqual({ title: "Sprawdzian", text: "Kinematyka", url: "https://example.com" });
  });

  it("bez danych zwraca null", () => {
    expect(readSharedPayload(new URLSearchParams(""))).toBeNull();
    expect(readSharedPayload(new URLSearchParams("title=%20%20"))).toBeNull();
  });

  it("składa sensowne zadanie, gdy brak tytułu", () => {
    expect(sharedPayloadToTask({ text: "Przeczytać rozdział 4\nszczegóły" })).toEqual({
      title: "Przeczytać rozdział 4",
      note: "Przeczytać rozdział 4\nszczegóły",
    });
    expect(sharedPayloadToTask({ url: "https://example.com" }).title).toBe("https://example.com");
    expect(sharedPayloadToTask({}).title).toBe("Udostępnione");
  });

  it("przycina zbyt długie treści", () => {
    const long = "x".repeat(600);
    const task = sharedPayloadToTask({ title: long, text: long });
    expect(task.title.length).toBe(120);
    expect(task.note.length).toBe(400);
  });
});
