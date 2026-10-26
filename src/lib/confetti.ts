const COLORS = ["#6f9f7e", "#e07a5f", "#eebc55", "#8f8ad4", "#5f9fd6", "#e3879a"];

export function confetti(x: number, y: number, count = 28) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    const size = 5 + Math.random() * 6;
    Object.assign(el.style, {
      position: "fixed",
      left: x + "px",
      top: y + "px",
      width: size + "px",
      height: size * (Math.random() > 0.5 ? 1 : 0.45) + "px",
      background: COLORS[i % COLORS.length],
      borderRadius: Math.random() > 0.6 ? "50%" : "2px",
      pointerEvents: "none",
      zIndex: "9999",
    } as CSSStyleDeclaration);
    document.body.appendChild(el);

    // Web Animations API nie istnieje w starszych Safari i części WebView.
    // Wcześniej brak `element.animate` kończył się wyjątkiem i przerywał akcję.
    if (typeof el.animate !== "function") {
      el.remove();
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 120;
    const dx = Math.cos(angle) * v;
    const dy = Math.sin(angle) * v - 80;
    try {
      const anim = el.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy + 160}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
        ],
        { duration: 900 + Math.random() * 600, easing: "cubic-bezier(.2,.7,.4,1)" }
      );
      anim.onfinish = () => el.remove();
    } catch {
      el.remove();
    }
  }
}

export function confettiFrom(el: Element | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + r.height / 2);
}
