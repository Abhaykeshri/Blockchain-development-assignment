/**
 * Cross-platform launcher for Windows / macOS / Linux.
 * Replaces shell-only constructs (fuser, NODE_ENV=...).
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] === "start" ? "start" : "dev";
const port = parseInt(process.env.PORT ?? "3000", 10);

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
