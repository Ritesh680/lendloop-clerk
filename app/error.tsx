"use client";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-start gap-4 p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        This page couldn&apos;t load
      </h1>
      <p className="text-steel">{errorMessage(error)}</p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
