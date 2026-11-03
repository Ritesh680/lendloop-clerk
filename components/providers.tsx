"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#f0b429",
          colorBackground: "#0f2935",
          colorForeground: "#eef4f2",
          colorInput: "#0a1c26",
          colorInputForeground: "#eef4f2",
          colorPrimaryForeground: "#14222a",
          colorMutedForeground: "#a9c0c8",
          borderRadius: "0.375rem",
        },
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "#0a1c26",
              border: "1px solid #3f6372",
              color: "#eef4f2",
              borderRadius: "0.375rem",
            },
          }}
        />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
