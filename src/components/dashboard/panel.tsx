import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The site overview's section surface: white card, hairline ring, faint lift. */
export const SURFACE = "overflow-hidden rounded-[14px] bg-card text-card-foreground ring-1 ring-border shadow-[0_1px_3px_rgb(0_0_0/0.04)]";

/** Section heading + one-line description, as every site-overview section opens. */
export function SectionHeading({ title, description, id }: { title: string; description?: React.ReactNode; id?: string }) {
  return (
    <div>
      <h2 id={id} className="text-[15px] leading-5 font-semibold tracking-tight">{title}</h2>
      {description && <p className="text-[13px] leading-[18px] text-muted-foreground">{description}</p>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  className,
  id,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className} id={id}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
