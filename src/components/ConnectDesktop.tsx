import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Btn } from "./ui";
import { useToast } from "./Toast";
import { copyText } from "../lib/clipboard";
import { bookmarkletCode, consoleSnippet } from "../lib/journal/bookmarklet";
import {
  addBookmarkMenu,
  addBookmarkShortcut,
  BROWSER_NAMES,
  detectBrowser,
  detectOs,
  devtoolsShortcut,
  JOURNAL_URL,
  showBookmarksShortcut,
  type Browser,
  type Os,
} from "../lib/journal/connect";

/**
 * Połączenie z dziennikiem na komputerze.
 *
 * Cały trik to jedna zakładka w przeglądarce, ale „bookmarklet” brzmi groźnie,
 * a pasek zakładek bywa schowany. Dlatego: trzy ponumerowane kroki, skróty
 * klawiszowe dopasowane do systemu, przycisk otwierający dziennik obok
 * i wyraźna informacja, że to konfiguracja jednorazowa.
 */

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="shrink-0 w-7 h-7 rounded-full bg-ink text-paper text-xs font-bold grid place-items-center"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-7">{title}</p>
        <div className="text-xs text-muted space-y-2 mt-1">{children}</div>
      </div>
    </li>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block rounded-md border border-line bg-paper px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink whitespace-nowrap">
      {children}
    </kbd>
  );
}

/** „⌘ + Shift + B” jako osobne klawisze — czytelniej niż jeden ciąg. */
function Shortcut({ value }: { value: string }) {
  return (
    <span className="whitespace-nowrap">
      {value.split(" + ").map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 && <span className="px-0.5 text-muted">+</span>}
          <Key>{part}</Key>
        </span>
      ))}
    </span>
  );
}

export function ConnectDesktop({ lastSync }: { lastSync?: string }) {
  const toast = useToast();
  const [os, setOs] = useState<Os>("other");
  const [browser, setBrowser] = useState<Browser>("other");
  const [dragging, setDragging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [href, setHref] = useState("");

  useEffect(() => {
    setOs(detectOs());
    setBrowser(detectBrowser(typeof navigator === "undefined" ? "" : navigator.userAgent));
    setHref(bookmarkletCode());
  }, []);

  const copy = async (value: string, message: string) => {
    const ok = await copyText(value);
    toast(ok ? message : "Przeglądarka nie pozwoliła skopiować — zaznacz kod ręcznie");
  };

  return (
    <section className="rounded-2xl border border-sage/40 bg-sage/8 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="link" className="w-4 h-4 text-sage" />
        <p className="text-sm font-semibold">Połącz z dziennikiem — {BROWSER_NAMES[browser]} na komputerze</p>
      </div>
      <p className="text-xs text-muted mb-3">
        Jednorazowa konfiguracja, bez instalowania programów. Później wystarczy otworzyć dziennik i kliknąć jeden
        przycisk na pasku zakładek — oceny, plan i sprawdziany same trafią do Plecaka.
      </p>

      {lastSync && (
        <div className="mb-3 rounded-xl bg-sage/15 px-3 py-2 text-xs space-y-2">
          <p>
            <b>Połączone.</b> Ostatnia aktualizacja: {new Date(lastSync).toLocaleString("pl-PL")}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={JOURNAL_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold border border-sage/40 bg-paper hover:border-ink cursor-pointer"
            >
              <Icon name="reset" className="w-3.5 h-3.5" /> Odśwież z dziennika
            </a>
            <span className="text-muted">otwórz dziennik i kliknij 🎒 na pasku zakładek</span>
          </div>
        </div>
      )}

      <ol className="space-y-4">
        <Step number={1} title="Pokaż pasek zakładek">
          <p>
            Naciśnij <Shortcut value={showBookmarksShortcut(os)} /> — pod paskiem adresu pojawi się miejsce na
            zakładki. Jeśli pasek już jest, pomiń ten krok.
          </p>
        </Step>

        <Step number={2} title="Przeciągnij ten przycisk na pasek zakładek">
          <div
            className={`rounded-xl border-2 border-dashed p-3 flex flex-wrap items-center gap-3 transition ${
              dragging ? "border-sage bg-sage/10" : "border-line"
            }`}
          >
            <a
              ref={(node) => node?.setAttribute("href", href || "#")}
              href="#"
              draggable
              onDragStart={() => setDragging(true)}
              onDragEnd={() => setDragging(false)}
              onClick={(event) => {
                event.preventDefault();
                void copy(href, "Kod skopiowany — wklej go jako adres nowej zakładki");
              }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-ink text-paper cursor-grab active:cursor-grabbing select-none"
              title="Przeciągnij mnie na pasek zakładek"
            >
              🎒 Pobierz z dziennika
            </a>
            <span className="text-xs text-muted">
              ← przeciągnij i upuść na pasek zakładek
              <span className="block text-[11px] opacity-80">Kliknięcie tylko kopiuje kod.</span>
            </span>
          </div>
        </Step>

        <Step number={3} title="Otwórz dziennik i kliknij przycisk na pasku">
          <p>Zaloguj się jak zwykle, a potem kliknij 🎒 na pasku zakładek. Zobaczysz podsumowanie i przycisk „Otwórz w Plecaku”.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={JOURNAL_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border border-line bg-paper hover:border-ink cursor-pointer"
            >
              <Icon name="external" className="w-4 h-4" /> Otwórz eduvulcan.pl
            </a>
          </div>
        </Step>
      </ol>

      <button
        type="button"
        onClick={() => setShowHelp((prev) => !prev)}
        aria-expanded={showHelp}
        className="mt-4 text-xs text-muted hover:text-ink underline decoration-dotted cursor-pointer"
      >
        {showHelp ? "Ukryj pozostałe sposoby" : "Nie wychodzi? Inne sposoby"}
      </button>

      {showHelp && (
        <div className="mt-3 space-y-3 text-xs">
          <div className="rounded-xl border border-line bg-paper p-3 space-y-2">
            <p className="font-semibold text-ink">Bez przeciągania — dodaj zakładkę ręcznie</p>
            <ol className="list-decimal pl-4 space-y-1 text-muted">
              <li>Otwórz Plecak na pełnej karcie i naciśnij <Shortcut value={addBookmarkShortcut(os)} />.</li>
              <li>W polu adresu wklej skopiowany kod (przycisk niżej), nazwę ustaw na „Plecak”.</li>
              <li>Zapisz — zakładka pojawi się na pasku.</li>
            </ol>
            <Btn variant="soft" onClick={() => void copy(href, "Kod skopiowany do zakładki")}>
              <Icon name="check" className="w-4 h-4" /> Skopiuj kod zakładki
            </Btn>
            <p className="text-[11px] text-muted">
              Gdyby skrót nie działał: {addBookmarkMenu(browser)}.
            </p>
          </div>

          <details className="rounded-xl border border-line bg-paper p-3">
            <summary className="cursor-pointer font-semibold text-ink">Dziennik blokuje zakładki (CSP)</summary>
            <div className="mt-2 space-y-2 text-muted">
              <p>
                Otwórz dziennik, naciśnij <Shortcut value={devtoolsShortcut(os)} />, wklej kod w konsolę i zatwierdź Enterem.
                Efekt jest ten sam.
              </p>
              <Btn variant="soft" onClick={() => void copy(consoleSnippet(), "Kod do konsoli skopiowany")}>
                Skopiuj kod do konsoli
              </Btn>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
