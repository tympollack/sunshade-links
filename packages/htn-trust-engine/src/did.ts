import crypto from "node:crypto";

export interface DidDocument {
  id: string; // e.g. "did:sunshade:tenant_123"
  publicKeyHex?: string;
  created: string;
}

export interface DidVerificationResult {
  valid: boolean;
  did: string;
  algorithm: string;
  error?: string;
}

/**
 * Validates SunShade and W3C DID string formatting
 */
export function validateDidFormat(did: string): boolean {
  if (!did || typeof did !== "string") return false;
  // Standard format: did:<method>:<method-specific-id>
  const didRegex = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/;
  return didRegex.test(did);
}

/**
 * Verifies Ed25519 cryptographic signature against data and public key
 */
export function verifyEd25519Signature(
  data: string | Buffer,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const rawPubKey = Buffer.from(publicKeyHex, "hex");
    if (rawPubKey.length !== 32) {
      return false;
    }

    // Wrap 32-byte raw Ed25519 public key in standard SPKI DER format
    // Prefix: 302a300506032b6570032100 (12 bytes)
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const spkiKey = Buffer.concat([spkiPrefix, rawPubKey]);

    const keyObject = crypto.createPublicKey({
      key: spkiKey,
      format: "der",
      type: "spki",
    });

    const sigBuffer = Buffer.from(signatureHex, "hex");
    const dataBuffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;

    return crypto.verify(null, dataBuffer, keyObject, sigBuffer);
  } catch {
    return false;
  }
}
