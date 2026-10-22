import * as age from "age-encryption";

const AGE_EXTENSION = "age";
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
]);
const TEXT_EXTENSIONS = new Set(["md", "txt", "csv", "json", "log"]);

export type PreviewKind = "image" | "text" | "binary";

export function ageFileName(name: string): string {
  return name.endsWith(`.${AGE_EXTENSION}`) ? name : `${name}.${AGE_EXTENSION}`;
}

export function sourceFileName(name: string): string | null {
  return name.endsWith(`.${AGE_EXTENSION}`)
    ? name.slice(0, -(AGE_EXTENSION.length + 1))
    : null;
}

export function previewKindForExtension(ext: string): PreviewKind {
  const normalized = ext.toLowerCase();
  if (IMAGE_EXTENSIONS.has(normalized)) {
    return "image";
  }
  if (TEXT_EXTENSIONS.has(normalized)) {
    return "text";
  }
  return "binary";
}

export async function encryptBytesToAge(
  data: Uint8Array,
  recipients: string[],
): Promise<Uint8Array> {
  const encrypter = new age.Encrypter();
  for (const recipient of recipients) {
    encrypter.addRecipient(recipient);
  }
  return encrypter.encrypt(data);
}

export async function decryptAgeBytes(
  data: Uint8Array,
  identities: string[],
): Promise<Uint8Array> {
  const decrypter = new age.Decrypter();
  for (const identity of identities) {
    try {
      decrypter.addIdentity(identity);
    } catch {
      // Skip malformed identity lines; a valid later identity can still decrypt.
    }
  }
  try {
    return await decrypter.decrypt(data);
  } catch {
    throw new Error("no matching identity");
  }
}

export async function decryptAgeBytesWithPassphrase(
  data: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  const decrypter = new age.Decrypter();
  decrypter.addPassphrase(passphrase);
  try {
    return await decrypter.decrypt(data);
  } catch {
    throw new Error("passphrase required or incorrect");
  }
}
