import * as age from "age-encryption";

export const INLINE_TOKEN_PREFIX = "sec:v1:";

const BASE64_URL_RE = /^[A-Za-z0-9_-]+$/;

function normalizeArmor(armored: string): string {
  return armored
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!BASE64_URL_RE.test(value)) {
    throw new Error("invalid secure token");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new Error("invalid secure token");
  }
}

function buildEncrypter(recipients: string[]): age.Encrypter {
  const encrypter = new age.Encrypter();
  for (const recipient of recipients) {
    encrypter.addRecipient(recipient);
  }
  return encrypter;
}

function buildIdentityDecrypter(identities: string[]): age.Decrypter {
  const decrypter = new age.Decrypter();
  for (const identity of identities) {
    try {
      decrypter.addIdentity(identity);
    } catch {
      // Skip malformed identity lines; a valid later identity can still decrypt.
    }
  }
  return decrypter;
}

export async function encryptToArmored(
  plaintext: string,
  recipients: string[],
): Promise<string> {
  const ciphertext = await buildEncrypter(recipients).encrypt(plaintext);
  return age.armor.encode(ciphertext);
}

export async function encryptToInlineToken(
  plaintext: string,
  recipients: string[],
): Promise<string> {
  const ciphertext = await buildEncrypter(recipients).encrypt(plaintext);
  return INLINE_TOKEN_PREFIX + encodeBase64Url(ciphertext);
}

export async function decryptArmored(
  armored: string,
  identities: string[],
): Promise<string> {
  try {
    const ciphertext = age.armor.decode(normalizeArmor(armored));
    return await buildIdentityDecrypter(identities).decrypt(ciphertext, "text");
  } catch {
    throw new Error("no matching identity");
  }
}

export async function decryptInlineToken(
  token: string,
  identities: string[],
): Promise<string> {
  if (!token.startsWith(INLINE_TOKEN_PREFIX)) {
    throw new Error("invalid secure token");
  }
  const ciphertext = decodeBase64Url(token.slice(INLINE_TOKEN_PREFIX.length));
  try {
    return await buildIdentityDecrypter(identities).decrypt(ciphertext, "text");
  } catch {
    throw new Error("no matching identity");
  }
}

export async function encryptToArmoredWithPassphrase(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  const encrypter = new age.Encrypter();
  encrypter.setPassphrase(passphrase);
  const ciphertext = await encrypter.encrypt(plaintext);
  return age.armor.encode(ciphertext);
}

export async function decryptInlineTokenWithPassphrase(
  token: string,
  passphrase: string,
): Promise<string> {
  if (!token.startsWith(INLINE_TOKEN_PREFIX)) {
    throw new Error("invalid secure token");
  }
  const ciphertext = decodeBase64Url(token.slice(INLINE_TOKEN_PREFIX.length));
  try {
    const decrypter = new age.Decrypter();
    decrypter.addPassphrase(passphrase);
    return await decrypter.decrypt(ciphertext, "text");
  } catch {
    throw new Error("passphrase required or incorrect");
  }
}

export async function decryptArmoredWithPassphrase(
  armored: string,
  passphrase: string,
): Promise<string> {
  try {
    const ciphertext = age.armor.decode(normalizeArmor(armored));
    const decrypter = new age.Decrypter();
    decrypter.addPassphrase(passphrase);
    return await decrypter.decrypt(ciphertext, "text");
  } catch {
    throw new Error("passphrase required or incorrect");
  }
}
