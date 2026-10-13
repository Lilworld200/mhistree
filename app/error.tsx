"use client";
import Link from "next/link";
export default function ErrorBoundary({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="foundation-state" role="alert">
      <h1 className="ptitle-sm">This page couldn’t load</h1>
      <p>
        Please try again. If you were submitting information, check its status
        before resubmitting.
      </p>
      <button className="btn btn-dark" onClick={retry}>
        Try again
      </button>
      <Link href="/chat">Back to Mhistree</Link>
    </main>
  );
}
