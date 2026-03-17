import { useState, useEffect, useCallback } from "react";

export interface CurrentUser {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl: string | null;
}

const AUTH_ME_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

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

/**
 * Fetches /api/auth/me for current user (Google sign-in name/avatar).
 * - Loads once on mount.
 * - Re-fetches when the tab becomes visible (e.g. user returns to the app or re-logged in elsewhere).
 * - Re-fetches every 10 minutes so profile/avatar updates (e.g. after re-login) are picked up.
 * Note: The backend stores the avatar at login time; to see a new Google photo the user must log in again (or the backend would need to sync from Google).
 */
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  const refetch = useCallback(() => {
    fetchCurrentUser().then((data) => setUser(data));
  }, []);

  useEffect(() => {
    refetch();
    // After login redirect the cookie can be set slightly after first paint; refetch once so we pick up the new session
    const afterLogin = setTimeout(refetch, 1500);
    return () => clearTimeout(afterLogin);
  }, [refetch]);

  useEffect(() => {
    const interval = setInterval(refetch, AUTH_ME_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const onFocus = () => refetch();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [refetch]);

  return user;
}
