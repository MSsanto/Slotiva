import { mkdir, writeFile, readFile, lstat, rm } from "node:fs/promises";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { webcrypto, randomUUID, randomBytes } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const persist = path.join(root, ".wrangler", "demo");
const marker = path.join(persist, ".slotiva-demo");
const args = process.argv.slice(2);
if (args.some((arg) => !["--reset", "--serve"].includes(arg)))
  throw Error("Use --reset or --serve. Remote execution is not supported.");
const wrangler = path.join(
  root,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const base = [
  "--config",
  path.join(root, "wrangler.demo.jsonc"),
  "--persist-to",
  persist,
];
function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.stderr.write(result.stdout ?? "");
    throw Error("Local demo command failed.");
  }
}
try {
  const stat = await lstat(persist);
  if (stat.isSymbolicLink())
    throw Error("Demo storage must not be a symbolic link.");
  let recognized = "";
  try {
    recognized = await readFile(marker, "utf8");
  } catch {
    throw Error("Refusing to change unrecognized demo storage.");
  }
  if (recognized !== "slotiva-fictional-demo-v1")
    throw Error("Refusing to change unrecognized demo storage.");
  if (args.includes("--reset")) await rm(persist, { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(persist, { recursive: true });
await writeFile(marker, "slotiva-fictional-demo-v1");
run(["d1", "migrations", "apply", "DB", "--local", ...base]);
let seeded = false;
try {
  seeded = (await readFile(path.join(persist, ".seeded"), "utf8")) === "yes";
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!seeded) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const date = d.toISOString().slice(0, 10),
    weekday = (d.getUTCDay() + 6) % 7;
  const series = randomUUID(),
    confirmed = randomUUID(),
    pending = randomUUID();
  const sql = `UPDATE professionals SET display_name='Marina Exemplo',header_title='Agenda de demonstração',header_subtitle='Dados fictícios para testar o fluxo de agendamento.',version=version+1,last_actor='demo-seed' WHERE id='demo';
 INSERT INTO booking_series(id,professional_id,request_id,request_hash,frequency,occurrence_count,actor_subject) VALUES('${series}','demo','${series}','demo-fixture','once',1,'demo-seed');
 INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,status,decided_at,source,series_id,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
 SELECT '${confirmed}','demo',id,'${date}',${weekday},strftime('%s','${date}T11:00:00-03:00'),660,690,705,'Cliente de exemplo','demo-confirmed@example.com','${randomBytes(32).toString("hex")}','confirmed',unixepoch(),'professional','${series}',name,description,30,price_mode,price_cents,version FROM professional_services WHERE professional_id='demo' AND id='discovery';
 INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,status,approval_expires_at,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
 SELECT '${pending}','demo',id,'${date}',${weekday},strftime('%s','${date}T14:00:00-03:00'),840,870,885,'Solicitação de exemplo','demo-pending@example.com','${randomBytes(32).toString("hex")}','pending_approval',unixepoch()+86400,name,description,30,price_mode,price_cents,version FROM professional_services WHERE professional_id='demo' AND id='discovery';`;
  const seed = path.join(persist, "seed.sql");
  await writeFile(seed, sql);
  run(["d1", "execute", "DB", "--local", ...base, "--file", seed]);
  await writeFile(path.join(persist, ".seeded"), "yes");
}
console.log(
  "Fictional demo ready in isolated local storage. No email or Google delivery is enabled.",
);
if (args.includes("--serve")) {
  const salt = randomBytes(32).toString("hex");
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      process.env.SLOTIVA_DEMO_PASSWORD ?? "slotiva-demo-local",
    ),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await webcrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  const hash = `pbkdf2-sha256:100000:${salt}:${Buffer.from(derived).toString("hex")}`;
  const child = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      ...base,
      "--ip",
      "127.0.0.1",
      "--port",
      "8788",
      "--var",
      `ADMIN_PASSWORD_HASH:${hash}`,
      "--var",
      "AUTH_MODE:demo",
      "--var",
      "EMAIL_ENABLED:false",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
