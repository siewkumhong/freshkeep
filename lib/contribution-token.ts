const TOKEN_SEPARATOR = ".";

export async function createContributionToken(
  householdId: string,
  secret: string,
): Promise<string> {
  const signature = await sign(householdId, secret);
  return `${householdId}${TOKEN_SEPARATOR}${toBase64Url(signature)}`;
}

export async function verifyContributionToken(
  token: string,
  secret: string,
): Promise<string | null> {
  const separator = token.lastIndexOf(TOKEN_SEPARATOR);
  if (separator < 1 || separator === token.length - 1 || token.length > 300) {
    return null;
  }
  const householdId = token.slice(0, separator);
  if (!/^home_[0-9a-f-]+$/i.test(householdId)) return null;
  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(token.slice(separator + 1)),
      new TextEncoder().encode(householdId),
    );
    return valid ? householdId : null;
  } catch {
    return null;
  }
}

async function sign(value: string, secret: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign(
    "HMAC",
    await importKey(secret),
    new TextEncoder().encode(value),
  );
}

function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(value: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
