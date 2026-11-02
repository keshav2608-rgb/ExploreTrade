"use client";

import { useEffect } from "react";
import { ErrorBox } from "@/components/ui";

/** Route-level error boundary: a page that throws never blanks the app. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="space-y-4">
      <ErrorBox title="This page could not be shown" body="Something failed while loading your data. Your records are unchanged. Try again, and if it keeps happening check that the app and its database are running." />
      <button type="button" className="btn-secondary" onClick={reset}>Try again</button>
    </div>
  );
}
