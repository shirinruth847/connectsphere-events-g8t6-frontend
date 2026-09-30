import {
  getStatusPresentation,
  type StatusCode,
  type StatusDomain,
} from "@/lib/status";
import { Chip } from "./Chip";

interface StatusChipProps<D extends StatusDomain> {
  domain: D;
  status: StatusCode<D>;
  className?: string;
}

export function StatusChip<D extends StatusDomain>({
  domain,
  status,
  className,
}: StatusChipProps<D>) {
  const { label, tone, icon } = getStatusPresentation(domain, status);
  return (
    <Chip tone={tone} icon={icon} className={className}>
      {label}
    </Chip>
  );
}
