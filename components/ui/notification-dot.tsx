export function NotificationDot({
  label = "New care message",
}: {
  label?: string;
}) {
  return (
    <span className="care-notification-dot" role="img" aria-label={label} />
  );
}
