/** Kopiowanie do schowka z awaryjną ścieżką dla starszych przeglądarek i ramek. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Brak zgody albo brak HTTPS — próbujemy metody zapasowej.
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
