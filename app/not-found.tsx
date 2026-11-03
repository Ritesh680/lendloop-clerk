import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-start gap-4 p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Nothing hangs on this peg
      </h1>
      <p className="text-steel">This page doesn&apos;t exist or has moved.</p>
      <Link href="/" className={buttonClasses("primary")}>
        Go to the board
      </Link>
    </main>
  );
}
