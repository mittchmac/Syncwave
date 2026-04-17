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
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 60 * 60 * 12; // 12 hours

    // JWT Header
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
    // JWT Payload
    const payload = Buffer.from(JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + expiresIn,
    })).toString("base64url");

    const signingInput = `${header}.${payload}`;

    // Normalize the key: the env var may have literal \n instead of real newlines
    const pem = privateKey.replace(/\\n/g, "\n");

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

export default router;
