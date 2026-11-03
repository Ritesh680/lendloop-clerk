import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="pegboard flex min-h-dvh items-center justify-center p-4">
      <SignIn forceRedirectUrl="/browse" />
    </main>
  );
}
