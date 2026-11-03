import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="font-display text-xl font-bold tracking-tight text-chalk"
    >
      Lend<span className="text-manila">Loop</span>
    </Link>
  );
}
