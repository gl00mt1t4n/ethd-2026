import { getAddress } from "viem";

export function normalizeEvmAddress(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(raw) ? raw.toLowerCase() : null;
}

export function requireEvmAddress(value: string | null | undefined, field: string): string {
  const normalized = normalizeEvmAddress(value);
  if (!normalized) {
    throw new Error(`${field} must be a valid 0x address.`);
  }
  return getAddress(normalized);
}
