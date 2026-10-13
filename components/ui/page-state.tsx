import Link from "next/link";
export function PageState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="foundation-state">
      <h1 className="ptitle-sm">{title}</h1>
      <div className="small">{children}</div>
      <Link className="btn btn-soft" href="/chat">
        Back to Mhistree
      </Link>
    </section>
  );
}
