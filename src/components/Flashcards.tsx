import { useEffect, useMemo, useState } from "react";
import { useLocal } from "../lib/store";
import { defaultCards, subjectColor, uid, type Card } from "../lib/data";
import { confetti } from "../lib/confetti";
import { Btn, CardTitle, PageHeader } from "./ui";
import { Icon } from "./Icon";

function pick(cards: Card[], avoid?: string) {
  const pool = cards.length > 1 ? cards.filter((c) => c.id !== avoid) : cards;
  const weights = pool.map((c) => Math.pow(2, 5 - c.box));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

export function Flashcards() {
  const [cards, setCards] = useLocal<Card[]>("cards", defaultCards);
  const decks = useMemo(() => Array.from(new Set(cards.map((c) => c.deck))), [cards]);
  const [deck, setDeck] = useState<string>("Wszystkie");
  const inDeck = useMemo(() => (deck === "Wszystkie" ? cards : cards.filter((c) => c.deck === deck)), [cards, deck]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [streak, setStreak] = useState(0);
  const [form, setForm] = useState({ deck: decks[0] ?? "", front: "", back: "" });

  const current = inDeck.find((c) => c.id === currentId) ?? null;

  useEffect(() => {
    if (!current && inDeck.length) setCurrentId(pick(inDeck).id);
  }, [current, inDeck]);

  const answer = (ok: boolean) => {
    if (!current) return;
    const updated = cards.map((c) => (c.id === current.id ? { ...c, box: ok ? Math.min(5, c.box + 1) : 1 } : c));
    setCards(updated);
    const s = ok ? streak + 1 : 0;
    setStreak(s);
    if (ok && s > 0 && s % 5 === 0) confetti(window.innerWidth / 2, window.innerHeight / 2.5, 40);
    setFlipped(false);
    const pool = deck === "Wszystkie" ? updated : updated.filter((c) => c.deck === deck);
    setTimeout(() => setCurrentId(pick(pool, current.id).id), 180);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (flipped && e.key === "ArrowRight") answer(true);
      if (flipped && e.key === "ArrowLeft") answer(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const boxes = [1, 2, 3, 4, 5].map((b) => inDeck.filter((c) => c.box === b).length);
  const mastery = inDeck.length ? inDeck.reduce((a, c) => a + (c.box - 1), 0) / (inDeck.length * 4) : 0;
  const color = current ? subjectColor(current.deck) : "var(--color-lav)";

  return (
    <div>
      <PageHeader kicker="Powtórki, które działają" title="Fiszki">
        <div className="flex flex-wrap gap-2">
          {["Wszystkie", ...decks].map((d) => (
            <button
              key={d}
              onClick={() => {
                setDeck(d);
                setCurrentId(null);
                setFlipped(false);
              }}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${deck === d ? "bg-ink text-paper" : "card !rounded-xl hover:border-sage"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          {current ? (
            <div className="rise">
              <div className="flip cursor-pointer select-none" onClick={() => setFlipped((f) => !f)}>
                <div className={`flip-inner relative h-72 md:h-80 ${flipped ? "flipped" : ""}`}>
                  <div className="face absolute inset-0 card grid place-items-center p-8 text-center overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-2" style={{ background: color }} />
                    <span className="absolute top-5 left-6 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
                      {current.deck}
                    </span>
                    <span className="absolute top-5 right-6 text-xs text-muted">pudełko {current.box}/5</span>
                    <p className="font-display text-3xl md:text-4xl font-semibold leading-tight">{current.front}</p>
                    <span className="absolute bottom-5 text-xs text-muted flex items-center gap-1.5">
                      <Icon name="flip" className="w-3.5 h-3.5" /> kliknij lub spacja
                    </span>
                  </div>
                  <div className="face face-back absolute inset-0 rounded-[1.5rem] grid place-items-center p-8 text-center text-white" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 60%, #2d2a32))` }}>
                    <p className="font-display text-2xl md:text-3xl font-semibold leading-snug">{current.back}</p>
                  </div>
                </div>
              </div>
              <div className={`flex gap-3 mt-5 justify-center transition ${flipped ? "opacity-100" : "opacity-0 pointer-events-none translate-y-2"}`}>
                <button onClick={() => answer(false)} className="flex-1 max-w-56 py-3.5 rounded-2xl font-semibold bg-clay/15 text-clay hover:bg-clay/25 transition cursor-pointer">
                  ← Jeszcze nie
                </button>
                <button onClick={() => answer(true)} className="flex-1 max-w-56 py-3.5 rounded-2xl font-semibold bg-sage text-white hover:opacity-90 transition cursor-pointer">
                  Umiem! →
                </button>
              </div>
              <p className="text-center text-xs text-muted mt-3">{streak > 1 ? `🔥 Seria: ${streak}` : "Strzałki ← → też działają po odwróceniu karty"}</p>
            </div>
          ) : (
            <div className="card h-72 grid place-items-center text-center p-8">
              <div>
                <div className="text-5xl mb-2">🗂️</div>
                <p className="font-display text-2xl">Brak fiszek w tej talii</p>
                <p className="text-sm text-muted">Dodaj pierwszą obok.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <section className="card p-6 rise" style={{ animationDelay: ".05s" }}>
            <CardTitle icon={<Icon name="cards" className="w-4 h-4" />} color="var(--color-lav)">
              Pudełka Leitnera
            </CardTitle>
            <div className="flex items-end gap-2 h-28">
              {boxes.map((n, i) => {
                const max = Math.max(1, ...boxes);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-xs font-semibold tabular-nums">{n}</span>
                    <div className="w-full rounded-lg" style={{ height: `${Math.max(6, (n / max) * 100)}%`, background: `color-mix(in oklab, var(--color-sage) ${20 + i * 20}%, var(--color-line))` }} />
                    <span className="text-[10px] text-muted">{i + 1}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted">Opanowanie</span>
                <span className="font-semibold">{Math.round(mastery * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-line overflow-hidden">
                <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${mastery * 100}%` }} />
              </div>
            </div>
            <p className="text-[11px] text-muted mt-3">Karty, których nie umiesz, wracają częściej. Te opanowane – rzadziej.</p>
          </section>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.front.trim() || !form.back.trim()) return;
              setCards((c) => [...c, { id: uid(), deck: form.deck.trim() || "Ogólne", front: form.front.trim(), back: form.back.trim(), box: 1 }]);
              setForm((f) => ({ ...f, front: "", back: "" }));
            }}
            className="card p-6 space-y-3 rise"
            style={{ animationDelay: ".1s" }}
          >
            <CardTitle icon={<Icon name="plus" className="w-4 h-4" />}>Nowa fiszka</CardTitle>
            <input list="decks" value={form.deck} onChange={(e) => setForm({ ...form, deck: e.target.value })} placeholder="Talia (np. Angielski)" className="input w-full" />
            <datalist id="decks">
              {decks.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <input value={form.front} onChange={(e) => setForm({ ...form, front: e.target.value })} placeholder="Przód – pytanie" className="input w-full" />
            <input value={form.back} onChange={(e) => setForm({ ...form, back: e.target.value })} placeholder="Tył – odpowiedź" className="input w-full" />
            <Btn type="submit" className="w-full" disabled={!form.front.trim() || !form.back.trim()}>
              Dodaj fiszkę
            </Btn>
          </form>

          {current && (
            <button
              onClick={() => {
                setCards((c) => c.filter((x) => x.id !== current.id));
                setCurrentId(null);
                setFlipped(false);
              }}
              className="text-xs text-muted hover:text-clay self-center flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="trash" className="w-3.5 h-3.5" /> usuń bieżącą fiszkę
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
