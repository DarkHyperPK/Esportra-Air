// Verifies the signed offline lease the Esportra backend issues with each access check. A valid lease
// lets a signed-in PC keep producing for a few days without a connection. Ported from the legacy
// src/air-access.js; the clock-rollback guard (`lastSeenAt`) is kept.

import { createPublicKey, constants, verify } from 'node:crypto';

export interface Lease {
  algorithm?: string;
  publicKey?: string;
  payload?: string;
  signature?: string;
}

export interface LeaseCheck {
  userId: string;
  deviceId: string;
  now?: number;
  /** The latest time this PC has seen; the clock may not run behind it. */
  lastSeenAt?: number;
  /** The key remembered from the first lease; a different key is refused. */
  pinnedKey?: string;
}

const DAY = 86_400_000;

export function leaseExpiry(lease: Lease | null | undefined): number | null {
  try {
    const payload = JSON.parse(Buffer.from(lease?.payload ?? '', 'base64').toString());
    const at = Date.parse(payload.expiresAt);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export function verifyLease(lease: Lease | null | undefined, check: LeaseCheck): boolean {
  try {
    const { userId, deviceId, now = Date.now(), lastSeenAt = 0, pinnedKey } = check;
    if (!lease || lease.algorithm !== 'RS256' || !pinnedKey || lease.publicKey !== pinnedKey) return false;
    if (typeof lease.payload !== 'string' || lease.payload.length > 16384 || typeof lease.signature !== 'string' || lease.signature.length > 2048) return false;
    const bytes = Buffer.from(lease.payload, 'base64');
    const ok = verify('RSA-SHA256', bytes, { key: createPublicKey(pinnedKey), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(lease.signature, 'base64'));
    if (!ok) return false;
    const payload = JSON.parse(bytes.toString());
    const issued = Date.parse(payload.issuedAt);
    const expires = Date.parse(payload.expiresAt);
    return payload.version === 1 && payload.userId === userId && payload.deviceId === deviceId && Number.isFinite(issued) && Number.isFinite(expires) && expires > now && issued <= now + 300_000 && expires - issued <= 7 * DAY + 1000 && now >= lastSeenAt - 300_000;
  } catch {
    return false;
  }
}
