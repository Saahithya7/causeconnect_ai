/**
 * Deterministic, RFC4122-compliant UUID helper for CauseConnect AI
 * Compatible with both browser and Node.js environments.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns true if the given string is a valid UUID
 */
export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Ensures an ID is a valid Postgres UUID. If already valid, returns lowercased.
 * If not valid, deterministically hashes the input into a valid v4-format UUID.
 */
export function ensureValidUuid(id: string): string {
  if (!id) {
    return '00000000-0000-4000-a000-000000000000';
  }

  const trimmed = id.trim();
  if (UUID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Pure JavaScript deterministic 32-hex generator that runs identically in Browser & Node
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  let h3 = 0x12345678;
  let h4 = 0x87654321;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 974241281);
    h4 = Math.imul(h4 ^ ch, 381201587);
  }

  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const hex = `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`;

  // Format as xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is in [8, 9, a, b]
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
