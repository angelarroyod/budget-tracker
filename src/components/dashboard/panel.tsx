import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
