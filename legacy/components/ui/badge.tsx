/* Provenance + verification status presentation.
   These colors are part of the product's visual contract and stay
   identical in light and dark themes. */

const PROV_META = {
  self: { label: "Patient reported", c: "#478BEE" },
  device: { label: "Device", c: "#8A63D2" },
  lab: { label: "Laboratory", c: "#2F8F5B" },
  clinician: { label: "Clinician verified", c: "#181818" },
  ai: { label: "AI inferred", c: "#C08A2D" },
} as const;

export type ProvenanceKey = keyof typeof PROV_META;

export const STATUS_COLORS: Record<string, string> = {
  verified: "#2F8F5B",
  reported: "#478BEE",
  inferred: "#C08A2D",
  corrected: "#C08A2D",
  disputed: "#CC5348",
  rejected: "#CC5348",
};

export function ProvBadge({ src }: { src: string }) {
  const meta = PROV_META[src as ProvenanceKey];
  if (!meta) return null;
  return (
    <span className="badge">
      <i className="badge-dot" style={{ background: meta.c }} />
      {meta.label}
    </span>
  );
}

export function StatusBadge({ st }: { st: string }) {
  const c = STATUS_COLORS[st] ?? "#6E6E6E";
  return (
    <span className="badge" style={{ color: c }}>
      <i className="badge-dot" style={{ background: c }} />
      {st.charAt(0).toUpperCase() + st.slice(1)}
    </span>
  );
}
