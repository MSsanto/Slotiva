import { webcrypto } from "node:crypto";
import { createInterface } from "node:readline/promises";
const input = createInterface({ input: process.stdin, output: process.stdout });
console.error(
  "Use this on your own terminal; do not paste the password into chat.",
);
const password = await input.question(
  "New admin password (12+ characters; visible in this terminal): ",
);
input.close();
if (password.length < 12) throw new Error("Use at least 12 characters.");
const salt = Buffer.from(
  webcrypto.getRandomValues(new Uint8Array(32)),
).toString("hex");
const key = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
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
console.log(
  `pbkdf2-sha256:100000:${salt}:${Buffer.from(hash).toString("hex")}`,
);
