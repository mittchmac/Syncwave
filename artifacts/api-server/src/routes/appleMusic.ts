import { Router, type IRouter } from "express";
import { createSign } from "node:crypto";

const router: IRouter = Router();

/**
 * Generate a MusicKit developer token (JWT signed with ES256).
 * Apple Music API: https://developer.apple.com/documentation/applemusicapi/generating_developer_tokens
 *
 * Required env vars (set as Replit secrets):
 *   APPLE_TEAM_ID        — 10-char Team ID   e.g. BS6UKB467M
 *   APPLE_KEY_ID         — 10-char Key ID    e.g. 7GBXB9235Z
 *   APPLE_PRIVATE_KEY    — Full PEM content of the .p8 file
 */
router.get("/apple-music-token", (_req, res): void => {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !privateKey) {
    res.status(503).json({ error: "Apple Music credentials not configured" });
    return;
  }

  try {
    const pem = reconstructPem(privateKey);

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 60 * 60 * 12; // 12 hours

    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + expiresIn,
    })).toString("base64url");

    const signingInput = `${header}.${payload}`;

    const sign = createSign("SHA256");
    sign.update(signingInput);
    sign.end();
    const rawSig = sign.sign({ key: pem, dsaEncoding: "ieee-p1363" });

    const token = `${signingInput}.${rawSig.toString("base64url")}`;
    res.json({ token, expiresIn });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Token generation failed: ${msg}` });
  }
});

/**
 * Replit secrets strip all newlines from multi-line values, leaving a flat
 * string like "-----BEGIN PRIVATE KEY----- MIGTAgE...-----END PRIVATE KEY-----".
 * This reconstructs proper PEM by re-inserting the required newlines and
 * wrapping the base64 payload at 64 chars per line.
 */
function reconstructPem(raw: string): string {
  // First try standard escape sequences that some storage systems use
  let pem = raw.replace(/\\n/g, "\n").replace(/\r/g, "").trim();

  // If it already has newlines it's fine as-is
  if (pem.includes("\n")) return pem;

  // Flat string — extract header, base64 body, footer
  const headerMatch = pem.match(/^(-----BEGIN [^-]+-----)/);
  const footerMatch = pem.match(/(-----END [^-]+-----)$/);

  if (!headerMatch || !footerMatch) {
    throw new Error("Cannot find PEM header/footer in APPLE_PRIVATE_KEY");
  }

  const header = headerMatch[1];
  const footer = footerMatch[1];

  // Everything between header and footer is the base64 body (minus any spaces/dashes)
  const body = pem
    .slice(header.length, pem.length - footer.length)
    .replace(/\s/g, ""); // strip any spaces that crept in

  // Wrap at 64 chars per line (RFC 7468 convention)
  const wrapped = (body.match(/.{1,64}/g) ?? [body]).join("\n");

  return `${header}\n${wrapped}\n${footer}`;
}

export default router;
