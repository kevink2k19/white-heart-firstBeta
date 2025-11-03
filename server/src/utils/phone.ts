// server/src/utils/phone.ts
export const DEFAULT_DIAL = process.env.PHONE_DIAL_PREFIX || "+95";

/**
 * Normalize a phone to E.164-ish using DEFAULT_DIAL.
 * - "+.." stays as-is
 * - "00.." -> "+" + rest
 * - "0xxxxx" -> DEFAULT_DIAL + "xxxxx"
 * - otherwise -> DEFAULT_DIAL + raw digits
 */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  if (s.startsWith("0")) return `${DEFAULT_DIAL}${s.slice(1)}`;
  return `${DEFAULT_DIAL}${s}`;
}

/** Helpful for generating alternative matches (both ways). */
export function phoneVariants(raw?: string | null): string[] {
  const out = new Set<string>();
  if (!raw) return [];
  const norm = normalizePhone(raw);
  if (norm) out.add(norm);

  // If already with dial, add a local 0-leading variant for matching
  if (norm?.startsWith(DEFAULT_DIAL)) {
    out.add(`0${norm.slice(DEFAULT_DIAL.length)}`);
  }

  // Raw itself
  out.add(String(raw));

  return Array.from(out);
}
