import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="pegboard flex min-h-dvh items-center justify-center p-4">
      <SignUp forceRedirectUrl="/browse" />
    </main>
  );
}
