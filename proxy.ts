import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Convenience only: redirects signed-out visitors before the page loads. The
// security boundary is in Convex, which authorizes every function call itself.
const isProtected = createRouteMatcher([
  "/browse(.*)",
  "/listings(.*)",
  "/requests(.*)",
  "/incoming(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtected(request)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
