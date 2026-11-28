// The PUBG MOBILE player id Air matches on (28 Nov). The observer API's `uID` is the player's Character ID: the
// document's `getobservingplayer` returns "Character ID" with the same value as `uID`. Nothing else about it is
// assumed here except that it is written in digits, so the checks only ask for digits (5 to 20 of them, so a typo
// like a missing half is caught, and a spreadsheet's 5.03E+09 is told apart from a real id).

export const UID = /^\d{5,20}$/;
export const isUid = (v: unknown): v is string => typeof v === 'string' && UID.test(v);

/** What a typed or pasted id is: the digits, or why it is not usable. Empty is fine (no UID yet). */
export function cleanUid(raw: unknown): { uid: string; problem: string | null } {
  let s = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { uid: '', problem: null };
  // A sheet that turned the id into a number: "5031945047.0" is the same id; "5.03E+09" lost its digits.
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  if (/^[\d.]+e\+?\d+$/i.test(s)) return { uid: '', problem: 'The sheet turned this id into a number (like 5.03E+09) and lost digits. Format the column as text and export again.' };
  s = s.replace(/[\s'’]/g, '');
  if (!/^\d+$/.test(s)) return { uid: '', problem: 'A UID is only digits.' };
  if (!UID.test(s)) return { uid: '', problem: 'A UID is 5 to 20 digits.' };
  return { uid: s, problem: null };
}

/** How many digits differ between two ids of the same length (null when the lengths differ). */
export function digitsApart(a: string, b: string): number | null {
  if (a.length !== b.length) return null;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}
