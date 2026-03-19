import { useParams } from "react-router-dom";

/**
 * Returns a function that builds channel-prefixed paths for navigation.
 * Only valid when rendered under a route with :channelId (e.g. /c/:channelId/...).
 */
export function useChannelPath(): (path: string) => string {
  const { channelId } = useParams();
  return (path: string) => `/c/${channelId}${path}`;
}
