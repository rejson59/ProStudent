/**
 * Powiadomienia systemowe.
 *
 * `new Notification()` rzuca `TypeError` w Safari/iOS (konstruktor nie istnieje,
 * choć samo API uprawnień jest dostępne), dlatego wszystko jest w `try/catch`.
 */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notify(title: string, body: string) {
  if (!notificationsSupported()) return false;
  try {
    if (Notification.permission !== "granted") return false;
    new Notification(title, { body, icon: "/favicon.ico" });
    return true;
  } catch {
    return false;
  }
}

export async function requestNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
