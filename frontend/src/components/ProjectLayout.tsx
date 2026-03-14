import { useEffect, useState } from "react";
import { useNavigate, useParams, Outlet } from "react-router-dom";
import { PageError } from "@/components/PageError";

/**
 * Wraps app routes under /p/:projectId. Redirects / to /p/:firstProjectId.
 * Validates projectId and redirects to first project if invalid.
 */
export function ProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    setProjectError(null);
    fetch("/api/projects", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          setProjectError("Please sign in to continue.");
          setReady(true);
          return null;
        }
        return r.ok ? r.json() : [];
      })
      .then((list: { id: string }[] | null) => {
        if (list === null) return;
        const ids = list?.map((p) => p.id).filter(Boolean) || [];
        const first = ids[0];
        if (!first) {
          setReady(true);
          return;
        }
        if (!projectId) {
          navigate(`/p/${first}`, { replace: true });
          return;
        }
        if (!ids.includes(projectId)) {
          navigate(`/p/${first}`, { replace: true });
          return;
        }
        setReady(true);
      })
      .catch((e) => {
        setProjectError(e instanceof Error ? e.message : "Could not load projects");
        setReady(true);
      });
  }, [projectId, navigate]);

  const refetchProjects = () => {
    setProjectError(null);
    setReady(false);
    fetch("/api/projects", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string }[]) => {
        const ids = list?.map((p) => p.id).filter(Boolean) || [];
        const first = ids[0];
        if (!first) {
          setReady(true);
          return;
        }
        if (!projectId) {
          navigate(`/p/${first}`, { replace: true });
          return;
        }
        if (!ids.includes(projectId)) {
          navigate(`/p/${first}`, { replace: true });
          return;
        }
        setReady(true);
      })
      .catch(() => {
        setProjectError("Could not load projects");
        setReady(true);
      });
  };

  if (projectError) {
    const isAuth = projectError.includes("sign in");
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <PageError
          title={isAuth ? "Sign in required" : "Could not load project"}
          message={projectError}
          onRetry={isAuth ? undefined : refetchProjects}
          showHome
          homeLabel={isAuth ? "Go to sign in" : undefined}
          homeHref={isAuth ? "/login" : undefined}
        />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Outlet />;
}

/**
 * Redirects pathname "/" to /p/:firstProjectId.
 */
export function ProjectRootRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    fetch("/api/projects", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string }[]) => {
        const first = list?.[0]?.id;
        if (first) navigate(`/p/${first}`, { replace: true });
        else navigate("/login", { replace: true });
      })
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
