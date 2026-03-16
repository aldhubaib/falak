import { ReactNode } from "react";

export interface StoryDetailStageLikedProps {
  children: ReactNode;
  canApprove?: boolean;
  onApprove?: () => void;
  onPass?: () => void;
}

export function StoryDetailStageLiked({
  children,
}: StoryDetailStageLikedProps) {
  return <>{children}</>;
}
