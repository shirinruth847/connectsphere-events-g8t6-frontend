// Joins conditional class names. Deliberately no tailwind-merge: it cannot tell custom
// tokens such as `text-body` (size) and `text-on-surface` (color) apart without extra config.
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
