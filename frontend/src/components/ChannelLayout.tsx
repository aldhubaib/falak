import { useEffect, useState } from "react";
import { useNavigate, useParams, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PageError } from "@/components/PageError";

/**
 * Wraps app routes under /c/:channelId. Validates channelId exists via GET /api/profiles.
 * Redirects to profile picker (/) if channel not found.
 */
export function ChannelLayout() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch("/api/profiles", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          setError("Please sign in to continue.");
          setReady(true);
          return null;
        }
        return r.ok ? r.json() : [];
      })
      .then((list: { id: string }[] | null) => {
        if (list === null) return;
        const ids = list?.map((p) => p.id).filter(Boolean) || [];
        if (!channelId || !ids.includes(channelId)) {
          navigate("/", { replace: true });
          return;
        }
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load profiles");
        setReady(true);
      });
  }, [channelId, navigate]);

  if (error) {
    const isAuth = error.includes("sign in");
    return (
      <div className="min-h-screen flex items-center justify-center bg-card p-6">
        <PageError
          title={isAuth ? "Sign in required" : "Could not load profile"}
          message={error}
          onRetry={isAuth ? undefined : () => window.location.reload()}
          showHome
          homeLabel={isAuth ? "Go to sign in" : "Back to profiles"}
          homeHref={isAuth ? "/login" : "/"}
        />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Outlet />;
}
