// Input checks shared by everything the interface can save.

export const PLAIN = /^[^<>\x00-\x1f\x7f]*$/;
/** Images Air stored in the engine's asset store, or an https URL (Esportra logos). */
export const IMAGE = /^(https:\/\/[^\s"'<>]{1,500}|\/air-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const HEX = /^#[0-9a-f]{6}$/i;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plain text of 1 to `max` characters, trimmed. */
export function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || !PLAIN.test(value)) {
    throw new Error(`${label}: use plain text, 1–${max} characters.`);
  }
  return value.trim();
}

/** Like `text`, but empty is allowed and gives ''. */
export function optionalText(value: unknown, max: number, label: string): string {
  return typeof value === 'string' && value.trim() ? text(value, max, label) : '';
}

/** An image Air can serve, or '' for none. */
export function image(value: unknown, label: string): string {
  const v = typeof value === 'string' ? value : '';
  if (v && !IMAGE.test(v)) throw new Error(`${label}: choose the image again.`);
  return v;
}
