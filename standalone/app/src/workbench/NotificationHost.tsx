import type { NotificationState } from "./types";

interface NotificationHostProps {
  notifications: NotificationState[];
}

export function NotificationHost({ notifications }: NotificationHostProps) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <aside className="notification-host">
      {notifications.slice(-4).map((notification) => (
        <div className={`notification ${notification.level}`} key={notification.id}>
          {notification.message}
        </div>
      ))}
    </aside>
  );
}
