import { cn } from "@/lib/utils/cn";

/** Section header row: micro-label on the left, optional action on the right. */
export function Label({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="labrow">
      <MicroLabel>{children}</MicroLabel>
      {right}
    </div>
  );
}

export function MicroLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("mlabel", className)}>{children}</span>;
}
