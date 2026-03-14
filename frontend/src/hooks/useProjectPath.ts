import { useParams } from "react-router-dom";

/**
 * Returns a function that builds project-prefixed paths for navigation.
 * Only valid when rendered under a route with :projectId (e.g. /p/:projectId/...).
 */
export function useProjectPath(): (path: string) => string {
  const { projectId } = useParams();
  return (path: string) => `/p/${projectId}${path}`;
}
