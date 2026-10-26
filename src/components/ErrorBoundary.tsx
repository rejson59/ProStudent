import { Component, type ErrorInfo, type ReactNode } from "react";
import { exportData, resetData } from "../lib/store";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Zabezpieczenie przed „białym ekranem”.
 *
 * Bez niego każdy błąd renderowania (np. nietypowy zapis w `localStorage`)
 * kończył się pustą stroną bez informacji, gdzie podziały się dane.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Plecak] Nieoczekiwany błąd interfejsu:", error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  private clearAndReload = () => {
    if (!window.confirm("Usunąć wszystkie dane Plecaka i zacząć od nowa? Tej operacji nie da się cofnąć.")) return;
    resetData();
    window.location.reload();
  };

  private download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plecak-dane-awaryjne.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen grid place-items-center p-6 bg-paper text-ink">
        <div className="card p-8 max-w-lg w-full">
          <div className="text-5xl mb-3">🎒</div>
          <h1 className="font-display text-2xl font-semibold mb-2">Coś poszło nie tak</h1>
          <p className="text-sm text-muted mb-4">
            Aplikacja napotkała nieoczekiwany błąd. Twoje dane nadal są w przeglądarce — możesz je najpierw pobrać,
            a potem spróbować ponownie.
          </p>

          <pre className="text-xs bg-paper border border-line rounded-xl p-3 overflow-auto max-h-32 mb-5">
            {error.message || String(error)}
          </pre>

          <div className="flex flex-wrap gap-3">
            <button onClick={this.retry} className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-ink text-paper cursor-pointer">
              Spróbuj ponownie
            </button>
            <button onClick={this.download} className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-sage/15 text-sage cursor-pointer">
              Pobierz kopię danych
            </button>
            <button onClick={this.clearAndReload} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-clay hover:bg-clay/10 cursor-pointer">
              Wyczyść dane
            </button>
          </div>
        </div>
      </div>
    );
  }
}
