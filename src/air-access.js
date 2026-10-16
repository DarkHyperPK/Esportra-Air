"use strict";
const crypto = require("node:crypto");
function verifyLease(
  lease,
  { userId, deviceId, now = Date.now(), lastSeenAt = 0, pinnedKey } = {},
) {
  try {
    if (
      !lease ||
      lease.algorithm !== "RS256" ||
      lease.publicKey !== pinnedKey ||
      typeof lease.payload !== "string" ||
      lease.payload.length > 16384 ||
      typeof lease.signature !== "string" ||
      lease.signature.length > 2048
    )
      return false;
    const bytes = Buffer.from(lease.payload, "base64");
    if (
      !crypto.verify(
        "RSA-SHA256",
        bytes,
        { key: pinnedKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(lease.signature, "base64"),
      )
    )
      return false;
    const payload = JSON.parse(bytes.toString());
    const issued = Date.parse(payload.issuedAt),
      expires = Date.parse(payload.expiresAt);
    return (
      payload.version === 1 &&
      payload.userId === userId &&
      payload.deviceId === deviceId &&
      Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      expires > now &&
      issued <= now + 300000 &&
      expires - issued <= 7 * 86400000 + 1000 &&
      now >= lastSeenAt - 300000
    );
  } catch (_) {
    return false;
  }
}
module.exports = { verifyLease };
