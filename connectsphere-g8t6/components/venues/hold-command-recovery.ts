// Actor-scoped, tab-local recovery. No access tokens are stored here.
export type HoldCommand = { body: string; key: string };

export function readHoldCommand(slot: string): HoldCommand | null {
  try {
    const command = JSON.parse(sessionStorage.getItem(slot) || "null");
    return command && typeof command.body === "string" && command.body.length <= 20000
      && typeof command.key === "string" && /^[0-9a-f-]{36}$/i.test(command.key)
      ? command : null;
  } catch { return null; }
}

export function saveHoldCommand(slot: string, command: HoldCommand | null) {
  try {
    if (command) sessionStorage.setItem(slot, JSON.stringify(command));
    else sessionStorage.removeItem(slot);
  } catch { /* The component also retains the key in memory. */ }
}
