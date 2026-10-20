export const INLINE_TOKEN_RE = /\bsec:v1:[A-Za-z0-9_-]+/g;

export function secureBlock(armored: string): string {
  const fence = armored.includes("```") ? "````" : "```";
  return `${fence}secure\n${armored.trim()}\n${fence}`;
}
