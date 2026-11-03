"use client";

import { SignOutButton, UserButton } from "@clerk/nextjs";
import clsx from "clsx";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Badge } from "./ui/badge";
import { buttonClasses } from "./ui/button";
import { EmptyState } from "./ui/empty";
import { PageSkeleton } from "./ui/skeletons";
import { Wordmark } from "./wordmark";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AuthLoading>
        <ShellFrame>
          <PageSkeleton />
        </ShellFrame>
      </AuthLoading>
      <Authenticated>
        <ProvisionedUser>
          <ShellFrame nav>
            <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
          </ShellFrame>
        </ProvisionedUser>
      </Authenticated>
      <Unauthenticated>
        <ShellFrame>
          <SessionRejected />
        </ShellFrame>
      </Unauthenticated>
    </div>
  );
}

/**
 * proxy.ts has already confirmed a Clerk session by this point, so landing here
 * means Convex refused the token. Without this the page would render blank.
 */
function SessionRejected() {
  return (
    <EmptyState
      title="We couldn't confirm your session"
      action={
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className={buttonClasses("primary")}>
            Sign in again
          </button>
        </SignOutButton>
      }
    >
      Sign in again to continue. If you&apos;re running LendLoop locally and this
      keeps happening, check the Clerk JWT template and CLERK_JWT_ISSUER_DOMAIN in
      the README.
    </EmptyState>
  );
}

/** Holds rendering until the Convex user row exists, as every query needs it. */
function ProvisionedUser({ children }: { children: ReactNode }) {
  const ensureUser = useMutation(api.users.ensureCurrentUser);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    ensureUser()
      .then(() => live && setReady(true))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [ensureUser]);

  if (failed) {
    throw new Error("Could not set up your account.");
  }
  if (!ready) {
    return (
      <ShellFrame>
        <PageSkeleton />
      </ShellFrame>
    );
  }
  return children;
}

function ShellFrame({ nav, children }: { nav?: boolean; children: ReactNode }) {
  return (
    <>
      <header className="border-b border-enamel-700 bg-enamel-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Wordmark href="/browse" />
          {nav && <UserArea />}
        </div>
        {nav && <MainNav />}
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
        {children}
      </main>
    </>
  );
}

function UserArea() {
  const me = useQuery(api.users.me);
  return (
    <div className="flex items-center gap-3">
      {me?.trustedLender && <Badge tone="brass">Trusted lender</Badge>}
      {me?.role === "admin" && <Badge tone="neutral">Admin</Badge>}
      <UserButton />
    </div>
  );
}

function MainNav() {
  const me = useQuery(api.users.me);
  const pendingCount = useQuery(api.loans.incomingPendingCount);
  const pathname = usePathname();

  const links = [
    { href: "/browse", label: "All tools" },
    { href: "/listings", label: "My listings" },
    { href: "/requests", label: "My requests" },
    { href: "/incoming", label: "Incoming requests", count: pendingCount },
    ...(me?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <nav aria-label="Main" className="border-t border-enamel-800">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-8">
        {links.map(({ href, label, count }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-brass text-chalk"
                    : "border-transparent text-steel hover:text-chalk",
                )}
              >
                {label}
                {!!count && (
                  <span className="rounded bg-brass px-1.5 font-mono text-[11px] text-ink tabular-nums">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
