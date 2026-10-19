"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginErrorBanner() {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);
  const hasError = searchParams.has("error") || searchParams.get("auth_error") === "1";

  if (!hasError || dismissed) return null;

  return (
    <div className="login-error-banner" role="alert">
      <span>We couldn&apos;t sign you in. Please try again.</span>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss sign-in error">Dismiss</button>
    </div>
  );
}
