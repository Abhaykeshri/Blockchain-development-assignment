/**
 * Cross-platform launcher for Windows / macOS / Linux.
 * Replaces shell-only constructs (fuser, NODE_ENV=...).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mode = process.argv[2] === "start" ? "start" : "dev";
const port = parseInt(process.env.PORT ?? "3000", 10);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(__dirname, ".env.local"));

function isPortFree(p) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(p, "0.0.0.0");
  });
}

async function freePort(p) {
  if (await isPortFree(p)) return;

  // Best-effort: on Unix try fuser; on Windows try netstat + taskkill
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const find = spawn(
        "cmd.exe",
        ["/c", `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${p} ^| findstr LISTENING') do taskkill /F /PID %a`],
        { stdio: "ignore", shell: false }
      );
      find.on("close", () => resolve());
      find.on("error", () => resolve());
    });
  } else {
    await new Promise((resolve) => {
      const kill = spawn("fuser", ["-k", `${p}/tcp`], { stdio: "ignore" });
      kill.on("close", () => resolve());
      kill.on("error", () => resolve());
    });
  }

  // Give the OS a moment to release the port
  await new Promise((r) => setTimeout(r, 300));
}

await freePort(port);

const env = { ...process.env };
if (mode === "start") {
  env.NODE_ENV = "production";
} else if (!env.NODE_ENV) {
  env.NODE_ENV = "development";
}

const child = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
