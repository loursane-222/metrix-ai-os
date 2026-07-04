#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const ports = [3000, 3001];
const nextDir = join(rootDir, ".next");

const mode = process.argv[2] ?? "doctor";

function runCapture(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function runForeground(command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function getPortPids(port) {
  const result = runCapture("lsof", ["-nP", `-tiTCP:${port}`, "-sTCP:LISTEN"]);
  if (result.status !== 0 && !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function getProcessRows() {
  const result = runCapture("ps", ["-o", "pid,ppid,command", "-ax"]);
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        command: match[3],
      };
    })
    .filter(Boolean);
}

function isNextDevCommand(command) {
  return (
    command.includes("next dev") ||
    command.includes("next-server (v") ||
    command.includes("npm run dev") ||
    command.includes("scripts/local-dev.mjs dev") ||
    command.includes("scripts/local-dev.mjs preview")
  );
}

function collectDescendants(rows, rootPids) {
  const childrenByParent = new Map();
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) ?? [];
    children.push(row.pid);
    childrenByParent.set(row.ppid, children);
  }

  const seen = new Set(rootPids);
  const stack = [...rootPids];
  while (stack.length) {
    const current = stack.pop();
    for (const childPid of childrenByParent.get(current) ?? []) {
      if (!seen.has(childPid)) {
        seen.add(childPid);
        stack.push(childPid);
      }
    }
  }

  return seen;
}

function getNextDevPids() {
  const currentPid = process.pid;
  const parentPid = process.ppid;
  const rows = getProcessRows();
  const rootPids = rows
    .filter((row) => isNextDevCommand(row.command))
    .map((row) => row.pid)
    .filter((pid) => pid !== currentPid && pid !== parentPid);

  const pids = collectDescendants(rows, rootPids);
  pids.delete(currentPid);
  pids.delete(parentPid);

  return [...pids].sort((a, b) => b - a);
}

function killPids(pids) {
  const uniquePids = [...new Set(pids)].filter(
    (pid) => pid > 0 && pid !== process.pid && pid !== process.ppid,
  );

  if (!uniquePids.length) {
    return;
  }

  for (const pid of uniquePids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The process may already be gone.
    }
  }
}

function forceKillPids(pids) {
  const uniquePids = [...new Set(pids)].filter(
    (pid) => pid > 0 && pid !== process.pid && pid !== process.ppid,
  );

  for (const pid of uniquePids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process may already be gone.
    }
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForPortsToClear(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = ports.flatMap((port) => getPortPids(port));
    if (!active.length) {
      return true;
    }

    sleep(200);
  }

  return false;
}

function cleanProcesses() {
  const portPids = ports.flatMap((port) => getPortPids(port));
  const nextPids = getNextDevPids();
  const allPids = [...new Set([...portPids, ...nextPids])];

  if (allPids.length) {
    console.log(`Stopping local dev processes: ${allPids.join(", ")}`);
    killPids(allPids);
    sleep(800);
    forceKillPids([...ports.flatMap((port) => getPortPids(port)), ...getNextDevPids()]);
    sleep(300);
  }

  const cleared = waitForPortsToClear();
  if (!cleared) {
    const remaining = ports
      .map((port) => ({ port, pids: getPortPids(port) }))
      .filter((entry) => entry.pids.length);

    throw new Error(
      `Ports did not clear: ${remaining
        .map((entry) => `${entry.port}=${entry.pids.join(",")}`)
        .join(" ")}`,
    );
  }

  const remainingNextPids = getNextDevPids();
  if (remainingNextPids.length) {
    throw new Error(`Next dev processes still active: ${remainingNextPids.join(", ")}`);
  }
}

function cleanNextCache() {
  rmSync(nextDir, { recursive: true, force: true });
  console.log("Removed .next");
}

function runPreflight() {
  const result = spawnSync("npm", ["run", "db:preflight"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printDoctor() {
  const nextHelp = runCapture("node_modules/.bin/next", ["dev", "--help"]);
  const nextVersion = runCapture("node", ["-p", "require('./node_modules/next/package.json').version"]);
  const portStatus = ports.map((port) => ({ port, pids: getPortPids(port) }));
  const nextPids = getNextDevPids();
  const nextContents = runCapture("find", [".next", "-maxdepth", "3", "-print"]);

  console.log("Local dev doctor");
  console.log(`Next version: ${nextVersion.stdout.trim() || "unknown"}`);
  console.log(
    `Next dev supports --webpack: ${
      nextHelp.stdout.includes("--webpack") ? "yes" : "no"
    }`,
  );
  console.log(
    `Next dev supports --turbo: ${nextHelp.stdout.includes("--turbo") ? "yes" : "no"}`,
  );

  for (const entry of portStatus) {
    console.log(
      `Port ${entry.port}: ${entry.pids.length ? `busy (${entry.pids.join(", ")})` : "free"}`,
    );
  }

  console.log(
    `Next dev processes: ${nextPids.length ? nextPids.join(", ") : "none"}`,
  );

  if (nextContents.status === 0 && nextContents.stdout.trim()) {
    const lines = nextContents.stdout.trim().split("\n");
    const hasServer = lines.some((line) => line === ".next/server");
    console.log(`.next exists: yes`);
    console.log(`.next/server exists: ${hasServer ? "yes" : "no"}`);
    console.log(".next sample:");
    for (const line of lines.slice(0, 20)) {
      console.log(`  ${line}`);
    }
  } else {
    console.log(".next exists: no");
  }
}

function runDev() {
  cleanProcesses();
  cleanNextCache();
  runPreflight();
  runForeground("node_modules/.bin/next", ["dev"]);
}

function runPreview() {
  cleanProcesses();
  cleanNextCache();

  const build = spawnSync("node_modules/.bin/next", ["build"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  const manifest = join(nextDir, "server", "middleware-manifest.json");
  if (!existsSync(manifest)) {
    throw new Error(
      "Build tamamlandı (exit 0) ama .next/server/middleware-manifest.json bulunamadı.\n" +
      "next start başlatılmıyor — 500 almak yerine burada duruyoruz.\n" +
      "Tekrar dene: npm run local:preview\n" +
      "Devam ederse: node scripts/local-dev.mjs doctor",
    );
  }

  runForeground("node_modules/.bin/next", ["start"]);
}

try {
  if (mode === "doctor") {
    printDoctor();
  } else if (mode === "dev") {
    runDev();
  } else if (mode === "preview") {
    runPreview();
  } else {
    console.error(`Unknown mode: ${mode}`);
    console.error("Usage: node scripts/local-dev.mjs <dev|doctor|preview>");
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
