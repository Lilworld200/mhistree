"use client";

import { useEffect, useState, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthModal } from "@/components/ui/auth-modal";

interface AuthGuardProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function AuthGuard({ children, title, description }: AuthGuardProps) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Loading state
  if (authenticated === null) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "60vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="glabel">Verifying session...</div>
      </div>
    );
  }

  // If unauthenticated, show modal prompt with X button
  if (!authenticated) {
    return (
      <>
        <div style={{ opacity: 0.25, pointerEvents: "none" }}>{children}</div>
        <AuthModal open={true} title={title} description={description} />
      </>
    );
  }

  return <>{children}</>;
}
