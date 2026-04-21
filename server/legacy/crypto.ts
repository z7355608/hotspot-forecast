import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const FALLBACK_SECRET = "local-dev-connector-secret-key-change-me";

function getKeyMaterial() {
  return process.env.CONNECTOR_SECRET_KEY || FALLBACK_SECRET;
}

function getKey() {
  return createHash("sha256").update(getKeyMaterial()).digest();
}

export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const cipherText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(payload: { cipherText: string; iv: string; authTag: string }) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plainText = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "base64")),
    decipher.final(),
  ]);
  return plainText.toString("utf8");
}
