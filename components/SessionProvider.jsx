"use client";
import { SessionProvider } from "next-auth/react";

export default function NextAuthProvider({ children }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchInterval={5 * 60}
    >
      {children}
    </SessionProvider>
  );
}
