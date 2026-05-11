#!/usr/bin/env node
// Walk the server import graph from entry points and report unreachable files.
// Used once for the cleanup pass on 2026-04-28; safe to delete after.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SERVER = path.join(ROOT, "server");

// Entry points: anything tsx/node will boot or vitest will pick up.
const ENTRY_POINTS = [
  "server/_core/index.ts",
  "server/legacy-bridge.ts",
  "server/legacy/index.ts",
  "server/legacy/http-server.ts",
  "server/legacy/monitor-scheduler.ts",
];

// Aggregator files — auto-discovered.
function findAll(dir, pattern) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      out.push(...findAll(full, pattern));
    } else if (pattern.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

const allServerTs = findAll(SERVER, /\.(ts|mts|tsx|mjs)$/);
const allTests = allServerTs.filter((f) => /\.test\.ts$/.test(f));
const allRouters = allServerTs.filter((f) => f.includes("/server/routers/"));
const allMjs = allServerTs.filter((f) => f.endsWith(".mjs"));

// All entry points = explicit list + tests + routers + .mjs scripts
const entries = new Set();
for (const e of ENTRY_POINTS) entries.add(path.join(ROOT, e));
for (const t of allTests) entries.add(t);
for (const r of allRouters) entries.add(r);
for (const m of allMjs) entries.add(m);

// Resolve an import string from a file's directory to an actual path.
function resolveImport(fromFile, importStr) {
  // Skip non-relative imports (npm packages) and node: builtins.
  if (!importStr.startsWith(".") && !importStr.startsWith("/")) return null;
  const baseDir = path.dirname(fromFile);
  let target = path.resolve(baseDir, importStr);
  // Strip .js/.mjs extension (TS sources use .js suffix in import paths).
  target = target.replace(/\.js$/, "").replace(/\.mjs$/, "");
  // Try variants.
  const candidates = [
    target,
    target + ".ts",
    target + ".tsx",
    target + ".mts",
    target + ".mjs",
    path.join(target, "index.ts"),
    path.join(target, "index.tsx"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// Extract import paths from a file's source (static + dynamic).
function extractImports(file) {
  const src = fs.readFileSync(file, "utf8");
  const imports = new Set();
  // Static: import ... from "..."; export ... from "..."
  const staticRe = /(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
  // Dynamic: import("...")
  const dynamicRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  // require("...")
  const requireRe = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const re of [staticRe, dynamicRe, requireRe]) {
    let m;
    while ((m = re.exec(src)) !== null) imports.add(m[1]);
  }
  return [...imports];
}

// BFS from entry points.
const reachable = new Set();
const queue = [...entries];
while (queue.length) {
  const f = queue.shift();
  if (reachable.has(f)) continue;
  reachable.add(f);
  let imports;
  try {
    imports = extractImports(f);
  } catch (e) {
    continue;
  }
  for (const imp of imports) {
    const resolved = resolveImport(f, imp);
    if (resolved && resolved.startsWith(SERVER) && !reachable.has(resolved)) {
      queue.push(resolved);
    }
  }
}

const dead = allServerTs.filter((f) => !reachable.has(f));
const rel = (p) => path.relative(ROOT, p);

console.log(`Total server/ files:       ${allServerTs.length}`);
console.log(`Reachable from entries:    ${reachable.size}`);
console.log(`Tests/routers/mjs entries: ${allTests.length + allRouters.length + allMjs.length}`);
console.log(`Explicit entry points:     ${ENTRY_POINTS.length}`);
console.log(`Unreachable (candidates):  ${dead.length}`);
console.log("");
console.log("=== UNREACHABLE FILES ===");
const grouped = {};
for (const d of dead) {
  const dir = path.dirname(rel(d));
  (grouped[dir] ||= []).push(path.basename(d));
}
for (const dir of Object.keys(grouped).sort()) {
  console.log(`\n${dir}/`);
  for (const f of grouped[dir].sort()) {
    const full = path.join(ROOT, dir, f);
    const lines = fs.readFileSync(full, "utf8").split("\n").length;
    console.log(`  ${f.padEnd(50)} ${String(lines).padStart(6)} lines`);
  }
}

const totalLines = dead.reduce((acc, f) => acc + fs.readFileSync(f, "utf8").split("\n").length, 0);
console.log("");
console.log(`Total dead code: ${totalLines} lines across ${dead.length} files`);
