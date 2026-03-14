import { useEffect, useState } from "react";
import { useNavigate, useParams, Outlet } from "react-router-dom";

/**
 * Wraps app routes under /p/:projectId. Redirects / to /p/:firstProjectId.
 * Validates projectId and redirects to first project if invalid.
 */
export function ProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
      .catch(() => setReady(true));
  }, [projectId, navigate]);

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
