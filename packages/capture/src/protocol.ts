// What the capture apps and Air agree on: roles, join codes and the producer's address.

export type PcRole = 'observer' | 'player';

export const DEFAULT_JOIN_PORT = 5301;

/** Letters and digits without the look-alikes (0 O 1 I L), so a code can be read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const formatCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;
export const parseCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** `192.168.1.40`, `192.168.1.40:5301` or `studio-pc.local:5301` → host and port. */
export function parseAddress(input: string): { host: string; port: number } {
  const m = /^\s*([A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)(?::(\d{1,5}))?\s*$/.exec(String(input));
  const port = m?.[3] ? Number(m[3]) : DEFAULT_JOIN_PORT;
  if (!m || port < 1024 || port > 65535) throw new Error('Enter the producer’s address as 192.168.1.40 or 192.168.1.40:5301.');
  return { host: m[1]!, port };
}
