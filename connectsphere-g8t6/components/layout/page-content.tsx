import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/primitives";

export function PageContent({ title, eyebrow, description, action, back, children }: {
  title: string;
  eyebrow: string;
  description?: string;
  action?: ReactNode;
  // A back link above the header, e.g. BackButton.
  back?: ReactNode;
  children: ReactNode;
}) {
  return <div className="space-y-6">
    {back}
    <PageHeader title={title} eyebrow={eyebrow} description={description} action={action} />
    <div className="space-y-4">{children}</div>
  </div>;
}
