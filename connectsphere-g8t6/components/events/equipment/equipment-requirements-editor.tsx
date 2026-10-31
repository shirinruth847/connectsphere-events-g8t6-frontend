"use client";

import { AlertBanner, Button, FormLabel, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { lineQuantityProblems, type EquipmentAvailabilityOption, type EquipmentLine } from "@/lib/technical-requests";
import type { AvailabilityState } from "./use-equipment-availability";

interface EquipmentRequirementsEditorProps {
  // Prefix for element IDs, unique on the page.
  idPrefix: string;
  lines: EquipmentLine[];
  onChange: (lines: EquipmentLine[]) => void;
  availability: AvailabilityState;
  onRetry: () => void;
  // Messages from the backend or the form, per line and for the whole list.
  lineErrors?: Record<number, string>;
  error?: string;
  maxLines?: number;
  emptyText?: string;
}

const availabilityText = (option: EquipmentAvailabilityOption, windowSet: boolean) =>
  windowSet
    ? `${option.availableQuantity} of ${option.totalQuantity} available for the event's time`
    : `${option.totalQuantity} in stock`;

// The equipment lines of an event request (SPM-286): add an item, set its
// quantity, remove it. Each line shows what is free for the event's time, or
// the stock while the dates are incomplete, and a quantity above it is flagged
// here before the backend refuses it. Used by the request form, the
// clarification amendment and the coordinator's technical request.
export function EquipmentRequirementsEditor({
  idPrefix,
  lines,
  onChange,
  availability,
  onRetry,
  lineErrors = {},
  error,
  maxLines = 20,
  emptyText = "No equipment requested.",
}: EquipmentRequirementsEditorProps) {
  const data = availability.data;
  const options = data?.equipment ?? [];
  const windowSet = Boolean(data?.window);
  // Stale quantities from an earlier window are shown but never block a line.
  const problems = availability.status === "ready" ? lineQuantityProblems(lines, data) : {};
  const optionFor = (equipmentId: number) => options.find((option) => option.equipmentId === equipmentId);
  const unchosen = options.filter((option) => !lines.some((line) => line.equipmentId === option.equipmentId));
  const nextChoice = unchosen.find((option) => option.availableQuantity > 0) ?? unchosen[0];
  const id = (part: string) => `${idPrefix}-${part}`;
  const replace = (index: number, change: Partial<EquipmentLine>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...change } : line)));

  return (
    <div className="grid min-w-0 gap-3">
      {data?.note ? (
        <p className="flex items-start gap-2 rounded-control bg-surface-container-low p-3 text-xs text-on-surface-variant">
          <Icon name="info" size={16} className="mt-px shrink-0 text-primary" />
          <span>{data.note} Quantities below are the total stock.</span>
        </p>
      ) : null}
      {availability.status === "error" ? (
        <AlertBanner tone="warning" title="Equipment availability could not be loaded">
          {availability.message} Your choices are kept and checked again when saved.
          <div className="mt-3"><Button type="button" variant="secondary" onClick={onRetry}><Icon name="refresh" size={16} />Retry</Button></div>
        </AlertBanner>
      ) : null}
      {availability.status === "loading" && !data ? (
        <div aria-busy="true" aria-label="Loading equipment"><Skeleton className="h-14 w-full" /></div>
      ) : null}

      {lines.length ? (
        <ul className="grid gap-2" aria-label="Requested equipment">
          {lines.map((line, index) => {
            const option = optionFor(line.equipmentId);
            const message = lineErrors[index] ?? problems[index];
            const hintId = id(`line-${index}-hint`);
            return (
              <li key={`${line.equipmentId}-${index}`} className="grid gap-2 rounded-control bg-surface-container-low p-3">
                <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                  <div className="min-w-0">
                    <FormLabel htmlFor={id(`equipment-${index}`)}>Equipment {index + 1}</FormLabel>
                    <select
                      id={id(`equipment-${index}`)}
                      value={line.equipmentId}
                      className={fieldClasses}
                      aria-describedby={hintId}
                      onChange={(change) => replace(index, { equipmentId: Number(change.target.value) })}
                    >
                      {!option ? <option value={line.equipmentId}>Equipment #{line.equipmentId}</option> : null}
                      {options.map((choice) => (
                        <option
                          key={choice.equipmentId}
                          value={choice.equipmentId}
                          disabled={lines.some((other, position) => position !== index && other.equipmentId === choice.equipmentId)}
                        >
                          {choice.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FormLabel htmlFor={id(`quantity-${index}`)}>Quantity {index + 1}</FormLabel>
                    <input
                      id={id(`quantity-${index}`)}
                      type="number"
                      min="1"
                      max={option ? Math.max(1, option.availableQuantity) : undefined}
                      step="1"
                      value={line.quantity || ""}
                      className={`${fieldClasses} ${message ? "border-error" : ""}`}
                      aria-invalid={message || error ? true : undefined}
                      aria-describedby={hintId}
                      onChange={(change) => replace(index, { quantity: Number(change.target.value) })}
                    />
                  </div>
                  <Button type="button" variant="quiet" aria-label={`Remove equipment ${index + 1}`} onClick={() => onChange(lines.filter((_, position) => position !== index))}>
                    <Icon name="close" size={16} />Remove
                  </Button>
                </div>
                <p id={hintId} className="text-xs text-on-surface-variant">
                  {option
                    ? <>{option.category ? `${option.category} · ` : ""}{availabilityText(option, windowSet)}</>
                    : data ? "No longer offered for new requests; kept as saved." : "Loading availability…"}
                </p>
                {message ? (
                  <p role="alert" className="text-xs font-semibold text-error"><Icon name="warning" size={16} className="mr-1 inline align-[-3px]" />{message}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-control bg-surface-container-low p-3 text-sm text-on-surface-variant">{emptyText}</p>
      )}

      {error ? (
        <p id={id("error")} role="alert" className="text-xs font-semibold text-error"><Icon name="warning" size={16} className="mr-1 inline align-[-3px]" />{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={lines.length >= maxLines || !nextChoice}
          onClick={() => { if (nextChoice) onChange([...lines, { equipmentId: nextChoice.equipmentId, quantity: 1 }]); }}
        >
          <Icon name="add" size={16} />Add equipment
        </Button>
        <span className="text-xs text-on-surface-variant">
          {data && !options.length ? "No equipment is currently offered." : `Up to ${maxLines} items. Choosing equipment does not reserve it.`}
        </span>
      </div>
    </div>
  );
}
