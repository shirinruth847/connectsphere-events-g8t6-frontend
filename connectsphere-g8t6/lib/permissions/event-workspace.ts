// Presentation helpers only: they decide which controls to render from the
// permissions the backend returned with the event. The backend still checks
// every save, so nothing here is an enforcement layer.

import { IDENTITY_FIELDS, type EventPermissions, type IdentityField } from "@/lib/api/event-workspace";

export const isFieldEditable = (permissions: EventPermissions, field: string) =>
  permissions.canEdit && permissions.editableFields.includes(field);

export const editableIdentityFields = (permissions: EventPermissions): IdentityField[] =>
  IDENTITY_FIELDS.filter((field) => isFieldEditable(permissions, field));
