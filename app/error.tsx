"use client";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="section"><span className="eyebrow">WTNS / Something went wrong</span><h1 className="page-title">PAGE UNAVAILABLE</h1><p className="error">{error.message || "This page could not be loaded."}</p><button className="button" onClick={reset}>Try again</button></div>;
}
