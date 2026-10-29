import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Btn } from "./ui";
import { useToast } from "./Toast";
import { promptInstall, shouldSuggestInstall, watchInstallPrompt } from "../lib/install";
import { detectPlatform } from "../lib/mobile";
import { copyText } from "../lib/clipboard";
import { useLocal } from "../lib/store";
import { decodeBool } from "../lib/schema";

/**
 * Instalacja Plecaka na telefonie/tablecie:
 *  - Android/Chrome/Edge: jedno kliknięcie (systemowe okno instalacji),
 *  - iPhone/iPad: instrukcja „Dodaj do ekranu początkowego” (Apple nie pozwala
 *    wywołać instalacji z kodu).
 */
export function InstallCard({ compact = false, dismissible = false }: { compact?: boolean; dismissible?: boolean }) {
  const toast = useToast();
  const [dismissed, setDismissed] = useLocal<boolean>("installDismissed", false, decodeBool);
  const [suggest, setSuggest] = useState(() => shouldSuggestInstall());
  const [canPrompt, setCanPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => watchInstallPrompt(setCanPrompt), []);

  const platform = detectPlatform();

  if (!suggest || dismissed) return null;

  const install = async () => {
    setBusy(true);
    const accepted = await promptInstall();
    setBusy(false);
    if (accepted) toast("Plecak dodany do ekranu głównego 🎒");
    else toast("Instalacja anulowana — możesz wrócić do tego w każdej chwili");
  };

  const ios = platform === "ios";

  return (
    <div className={`rounded-2xl border border-line p-4 ${compact ? "" : "bg-paper"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon name="sparkle" className="w-4 h-4 text-sage" />
        <p className="text-sm font-semibold">Zainstaluj Plecak na {ios ? "iPhonie/iPadzie" : "ekranie głównym"}</p>
      </div>
      <p className="text-xs text-muted mb-3">
        {ios
          ? "Aplikacja otworzy się bez paska przeglądarki i będzie działać offline — plan i zadania zawsze pod ręką."
          : "Uruchamiaj bez przeglądarki, także bez internetu. Dane zostają te same — nic nie znika."}
      </p>

      {canPrompt ? (
        <Btn variant="soft" onClick={install} disabled={busy}>
          <Icon name="plus" className="w-4 h-4" /> {busy ? "Instaluję…" : "Zainstaluj"}
        </Btn>
      ) : (
        <ol className="text-xs text-muted space-y-1.5 pl-1">
          <li>
            <b className="text-ink">1.</b> {ios ? "Dotknij przycisku Udostępnij" : "Otwórz menu przeglądarki"}{" "}
            <span className="whitespace-nowrap">
              {ios ? (
                <span aria-label="ikonа Udostępnij">⎋</span>
              ) : (
                <span aria-label="menu">⋮</span>
              )}
            </span>
          </li>
          <li>
            <b className="text-ink">2.</b> {ios ? "wybierz „Dodaj do ekranu początkowego”" : "wybierz „Dodaj do ekranu głównego” albo „Zainstaluj aplikację”"}
          </li>
          <li>
            <b className="text-ink">3.</b> potwierdź — gotowe, ikona pojawi się obok innych aplikacji
          </li>
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
        <button
          type="button"
          onClick={() => {
            void copyText(window.location.href);
            toast("Link skopiowany — otwórz go na telefonie");
          }}
          className="text-xs text-muted hover:text-ink underline decoration-dotted cursor-pointer"
        >
          Skopiuj link do telefonu
        </button>
        {dismissible && (
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              setSuggest(false);
            }}
            className="text-xs text-muted hover:text-ink underline decoration-dotted cursor-pointer"
          >
            Nie teraz
          </button>
        )}
      </div>
    </div>
  );
}
