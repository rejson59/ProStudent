export const TABS = [
  { id: "home", label: "Pulpit", icon: "home" },
  { id: "plan", label: "Plan lekcji", icon: "calendar" },
  { id: "tasks", label: "Zadania", icon: "check" },
  { id: "grades", label: "Oceny", icon: "chart" },
  { id: "focus", label: "Fokus", icon: "timer" },
  { id: "cards", label: "Fiszki", icon: "cards" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export const TAB_IDS: readonly TabId[] = TABS.map((t) => t.id);

export function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);
}
