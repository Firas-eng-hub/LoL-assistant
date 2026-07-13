"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is missing. Run `npx convex dev` to configure Convex.",
  );
}

const convex = new ConvexReactClient(convexUrl);

type ConvexClientProviderProps = {
  children: ReactNode;
};

export function ConvexClientProvider({
  children,
}: ConvexClientProviderProps) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
