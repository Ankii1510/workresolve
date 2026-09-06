import { cn } from "@/lib/utils/cn";

const sizeClasses = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2", lg: "h-9 w-9 border-[3px]" };

export function Spinner({ size = "md", className }: { size?: keyof typeof sizeClasses; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-current border-t-transparent",
        sizeClasses[size],
        className,
      )}
    />
  );
}
