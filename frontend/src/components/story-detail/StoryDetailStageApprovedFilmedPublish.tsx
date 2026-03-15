import { ReactNode } from "react";

export interface StoryDetailStageApprovedFilmedPublishProps {
  channelNode: ReactNode;
  scriptNode: ReactNode;
  markFilmedButton: ReactNode | null;
  youtubeSection: ReactNode | null;
  markDoneSection: ReactNode | null;
}

export function StoryDetailStageApprovedFilmedPublish({
  channelNode,
  scriptNode,
  markFilmedButton,
  youtubeSection,
  markDoneSection,
}: StoryDetailStageApprovedFilmedPublishProps) {
  return (
    <>
      {channelNode}
      {scriptNode}
      {markFilmedButton}
      {youtubeSection}
      {markDoneSection}
    </>
  );
}
