export const COMPROMISE_STATUS = {
  0: "To Be Determined",
  1: "Compromised",
  2: "Not Compromised",
  3: "Unknown"
} as const;

type CompromiseStatusKey = keyof typeof COMPROMISE_STATUS;

export function getCompromiseStatus(status: CompromiseStatusKey) {
  return COMPROMISE_STATUS[status];
}
