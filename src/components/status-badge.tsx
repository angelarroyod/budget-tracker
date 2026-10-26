import { AlertOctagonIcon, CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Status } from "@/lib/forecast";

const STYLE: Record<Status, { icon: typeof CheckCircle2Icon; color: string }> = {
  on_track: { icon: CheckCircle2Icon, color: "var(--status-good)" },
  at_risk: { icon: TriangleAlertIcon, color: "var(--status-warning)" },
  over: { icon: AlertOctagonIcon, color: "var(--status-critical)" },
};

/** Icon + label in text ink; the status hue only tints the icon and border, never carries meaning alone. */
export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("status");
  const { icon: Icon, color } = STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ borderColor: `color-mix(in oklab, ${color} 45%, transparent)`, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
    >
      <Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden />
      {t(status)}
    </span>
  );
}
