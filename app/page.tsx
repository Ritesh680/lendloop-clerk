import { SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Suspense } from "react";
import {
  PublicTools,
  PublicToolsSkeleton,
} from "@/components/public/public-tools";
import { buttonClasses } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-enamel-700">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Wordmark />
          <Suspense fallback={<div className="skeleton h-9 w-28 rounded-md" />}>
            <HeaderAction />
          </Suspense>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 pt-12 pb-12 sm:px-8 sm:pt-20">
          <h1 className="font-display text-[clamp(2.75rem,9vw,7.5rem)] leading-[0.92] font-bold tracking-tight text-balance">
            <span className="block">Borrow what you need.</span>
            <span className="block text-manila">Lend what you don&apos;t.</span>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <SignInButton mode="redirect" forceRedirectUrl="/browse">
              <button type="button" className={buttonClasses("primary", "px-5 text-base")}>
                Sign in to lend or borrow
              </button>
            </SignInButton>
            <p className="max-w-md text-steel">
              Most drills run for minutes in their whole lives. Your neighbors
              have one on the wall, and they&apos;d probably lend it to you.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="on-the-board"
          className="pegboard border-y border-enamel-700"
        >
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
            <h2
              id="on-the-board"
              className="mb-6 inline-block bg-enamel-950 px-2 py-1 font-display text-xl font-semibold tracking-tight"
            >
              On the board today
            </h2>
            <Suspense fallback={<PublicToolsSkeleton />}>
              <PublicTools />
            </Suspense>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-7xl px-4 py-6 text-sm text-steel sm:px-8">
        Owners stay private until you sign in and a loan is agreed.
      </footer>
    </div>
  );
}

/** Reads the session, so it streams separately from the static hero. */
async function HeaderAction() {
  const { userId } = await auth();
  if (userId) {
    return (
      <Link href="/browse" className={buttonClasses("secondary")}>
        Open the board
      </Link>
    );
  }
  return (
    <SignInButton mode="redirect" forceRedirectUrl="/browse">
      <button type="button" className={buttonClasses("secondary")}>
        Sign in
      </button>
    </SignInButton>
  );
}
