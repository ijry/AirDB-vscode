import type { NotificationState } from "./types";

interface NotificationHostProps {
  notifications: NotificationState[];
  onRespond?: (notification: NotificationState, value: unknown) => void;
  onDismiss?: (notification: NotificationState) => void;
}

export function NotificationHost({ notifications, onRespond, onDismiss }: NotificationHostProps) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <aside className="notification-host">
      {notifications.slice(-4).map((notification) => {
        const items = notification.items ?? [];
        const actionable = Boolean(notification.requestId);

        return (
          <div className={`notification ${notification.level}`} key={notification.id}>
            <p className="notification-message">{notification.message}</p>
            {items.length > 0 ? (
              <div className="notification-actions">
                {items.map((item, index) => (
                  <button
                    type="button"
                    key={`${item.label}-${index}`}
                    onClick={() => onRespond?.(notification, item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="notification-dismiss"
              onClick={() => actionable ? onRespond?.(notification, null) : onDismiss?.(notification)}
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </aside>
  );
}
