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

export async function availablePath(
  exists: (path: string) => Promise<boolean>,
  dir: string,
  source: string,
): Promise<string> {
  const join = (name: string): string =>
    dir === "" || dir === "/" ? name : `${dir}/${name}`;
  const dot = source.lastIndexOf(".");
  const stem = dot > 0 ? source.slice(0, dot) : source;
  const ext = dot > 0 ? source.slice(dot) : "";
  let candidate = join(source);
  let suffix = 0;
  while (await exists(candidate)) {
    suffix += 1;
    candidate = join(
      suffix === 1
        ? `${stem}-decrypted${ext}`
        : `${stem}-decrypted-${suffix}${ext}`,
    );
  }
  return candidate;
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

export async function decryptAgeBytesWithPassphrases(
  data: Uint8Array,
  passphrases: string[],
): Promise<Uint8Array | null> {
  for (const passphrase of passphrases) {
    try {
      return await decryptAgeBytesWithPassphrase(data, passphrase);
    } catch {
      continue;
    }
  }
  return null;
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
