/* Browser notifications: only ever after explicit permission, and only
 * where the browser supports them. */
export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** Show a notification. Returns false if permission is not granted. */
export function showBrowserNotification(title: string, body: string): boolean {
  if (!notificationsSupported()) return false
  if (Notification.permission !== 'granted') return false
  try {
    new Notification(title, { body, icon: '/icons/icon.svg' })
    return true
  } catch {
    return false
  }
}
