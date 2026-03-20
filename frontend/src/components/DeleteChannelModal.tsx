import { AlertTriangle } from "lucide-react";

interface DeleteChannelModalProps {
  open: boolean;
  channelName: string;
  onClose: () => void;
  onDelete: () => void;
}

export function DeleteChannelModal({ open, channelName, onClose, onDelete }: DeleteChannelModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-6 w-[380px] max-w-full">
        <div className="w-9 h-9 rounded-xl bg-destructive/10 border border-destructive/15 flex items-center justify-center mb-4">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <h3 className="text-[15px] font-semibold mb-2">Remove Channel</h3>
        <p className="text-[13px] text-dim leading-relaxed mb-6">
          Are you sure you want to remove <span className="text-foreground font-medium">{channelName}</span>? All analysis data will be permanently deleted.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-full bg-elevated border border-border text-sensor text-[13px] font-medium cursor-pointer transition-all hover:bg-border hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="py-1.5 px-4 rounded-full bg-destructive text-destructive-foreground text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
