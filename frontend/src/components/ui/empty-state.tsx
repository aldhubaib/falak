import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  className = "",
  children,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 py-12 ${className}`}
    >
      {Icon && <Icon className="w-10 h-10 text-dim opacity-50" />}
      <div className="space-y-1">
        <p className="text-[13px] text-muted-foreground">{title}</p>
        {description && (
          <p className="text-[12px] text-dim">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
