import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/primitives";

export function PageContent({ title, eyebrow, description, action, children }: {
  title: string;
  eyebrow: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return <div className="space-y-6">
    <PageHeader title={title} eyebrow={eyebrow} description={description} action={action} />
    <div className="space-y-4">{children}</div>
  </div>;
}
