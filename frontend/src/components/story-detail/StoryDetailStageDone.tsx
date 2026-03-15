import { ReactNode } from "react";

export interface StoryDetailStageDoneProps {
  children: ReactNode;
}

export function StoryDetailStageDone({ children }: StoryDetailStageDoneProps) {
  return <>{children}</>;
}
