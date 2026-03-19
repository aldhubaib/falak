import { useState, useEffect, useCallback, useRef } from "react";

export interface CurrentUser {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl: string | null;
}

const AUTH_ME_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const DEDUP_WINDOW_MS = 5_000;

function fetchCurrentUser(): Promise<CurrentUser | null> {
  return fetch("/api/auth/me", { credentials: "include" })
    .then((r) => {
      if (r.ok) return r.json();
      return null;
    })
    .then((data: { id?: string; name?: string; email?: string | null; avatarUrl?: string | null } | null) => {
      if (!data?.id) return null;
      return {
        id: data.id,
        name: data.name ?? "Anonymous",
        email: data.email ?? null,
        avatarUrl: data.avatarUrl ?? null,
      };
    })
    .catch(() => null);
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const lastFetchRef = useRef(0);

  const refetch = useCallback(() => {
    const now = Date.now();
    if (now - lastFetchRef.current < DEDUP_WINDOW_MS) return;
    lastFetchRef.current = now;
    fetchCurrentUser().then((data) => setUser(data));
  }, []);

  useEffect(() => {
    refetch();
    const afterLogin = setTimeout(refetch, 1500);
    const interval = setInterval(refetch, AUTH_ME_REFRESH_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(afterLogin);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetch]);

  return user;
}
