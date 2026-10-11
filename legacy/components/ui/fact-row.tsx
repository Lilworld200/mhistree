import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "./icons";
import { ProvBadge, type ProvenanceKey } from "./badge";

export function FactRow({
  k,
  v,
  src,
}: {
  k: React.ReactNode;
  v: React.ReactNode;
  src: ProvenanceKey | string;
}) {
  return (
    <div className="factrow">
      <span className="small">{k}</span>
      <b className="ell">{v}</b>
      <ProvBadge src={src} />
    </div>
  );
}

export function KvRow({
  k,
  v,
}: {
  k: React.ReactNode;
  v: React.ReactNode;
}) {
  return (
    <div className="kv">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

export function MiniRow({
  onClick,
  className,
  children,
}: {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (onClick) {
    return (
      <button onClick={onClick} className={cn("minirow", className)}>
        {children}
      </button>
    );
  }
  return <div className={cn("minirow", className)}>{children}</div>;
}

/** Circular tinted icon chip used inside list rows and cards. */
export function RowIcon({
  icon,
  color,
  bg,
  sm,
}: {
  icon: IconName;
  color: string;
  bg: string;
  sm?: boolean;
}) {
  return (
    <span className={cn("tic", sm && "tic-sm")} style={{ background: bg, color }}>
      <Icon n={icon} s={sm ? 14 : 17} />
    </span>
  );
}
