import { useState, useEffect } from "react";

export interface CurrentUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Fetches /api/auth/me; returns current user (Google sign-in name/avatar) or null if unauthenticated. */
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data: { id?: string; name?: string; avatarUrl?: string | null } | null) => {
        if (!data?.id) {
          setUser(null);
          return;
        }
        setUser({
          id: data.id,
          name: data.name ?? "Anonymous",
          avatarUrl: data.avatarUrl ?? null,
        });
      })
      .catch(() => setUser(null));
  }, []);

  return user;
}
