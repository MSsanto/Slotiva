// Disposable test password for CI/local E2E only. Never used in production.
import { writeFile, access } from "node:fs/promises";
import { webcrypto } from "node:crypto";
try {
  await access(".dev.vars");
  throw new Error(
    "Refusing to replace existing .dev.vars. Use an isolated checkout.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const salt = "a".repeat(64);
const key = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode("test-password-long"),
  "PBKDF2",
  false,
  ["deriveBits"],
);
const hash = await webcrypto.subtle.deriveBits(
  {
    name: "PBKDF2",
    hash: "SHA-256",
    salt: new TextEncoder().encode(salt),
    iterations: 100000,
  },
  key,
  256,
);
await writeFile(
  ".dev.vars",
  `COOKIE_SECURE=false\nADMIN_PASSWORD_HASH=pbkdf2-sha256:100000:${salt}:${Buffer.from(hash).toString("hex")}\n`,
  { mode: 0o600, flag: "wx" },
);
