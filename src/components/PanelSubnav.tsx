import { cn } from "@/lib/utils";

type PanelSubnavItem<T extends string> = {
  value: T;
  label: string;
};

export function PanelSubnav<T extends string>({
  items,
  active,
  onChange,
  className,
}: {
  items: PanelSubnavItem<T>[];
  active: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-full gap-2 overflow-x-auto overscroll-x-contain rounded-3xl border bg-card p-2 shadow-sm",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
            active === item.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
