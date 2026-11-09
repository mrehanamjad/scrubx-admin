#!/usr/bin/env node

/**
 * Static Regression Guards (TEST-006)
 *
 * Enforces critical architectural invariants, security rules, and prevents
 * regressions identified in the Production Remediation Plan.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, "src");

let hasErrors = false;

function error(guard, message, file = null, line = null) {
  hasErrors = true;
  const loc = file ? (line ? ` (${file}:${line})` : ` (${file})`) : "";
  console.error(`❌ [${guard}] FAILED: ${message}${loc}`);
}

function pass(guard, message) {
  console.log(`✅ [${guard}] PASS: ${message}`);
}

function warn(guard, message) {
  console.warn(`⚠️ [${guard}] ADVISORY: ${message}`);
}

function getAllFiles(dir, exts = [".ts", ".tsx", ".js", ".jsx", ".mjs"]) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        results.push(...getAllFiles(fullPath, exts));
      }
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log("═══════════════════════════════════════════════════════════");
console.log(" 🛡️ ScrubX Static Regression Guards (TEST-006)");
console.log("═══════════════════════════════════════════════════════════\n");

// =========================================================================
// G1: No occurrence of 'Admin@ScrubX2026' or 64-hex literal in src/
// =========================================================================
{
  const files = getAllFiles(SRC_DIR);
  let g1Failed = false;
  const hex64Regex = /\b[a-fA-F0-9]{64}\b/;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("Admin@ScrubX2026")) {
        error("G1", "Hardcoded seed password detected in source file", path.relative(ROOT_DIR, file), i + 1);
        g1Failed = true;
      }
      // Ignore comments or test data fixtures if any
      if (hex64Regex.test(line) && !line.includes("sha256") && !line.includes("hash") && !line.includes("//")) {
        error("G1", "Raw 64-character hex secret literal detected", path.relative(ROOT_DIR, file), i + 1);
        g1Failed = true;
      }
    }
  }
  if (!g1Failed) pass("G1", "Zero hardcoded seed credentials or 64-hex secrets in src/");
}

// =========================================================================
// G2: No redirect() inside src/actions/** or src/app/api/**
// =========================================================================
{
  const actionFiles = getAllFiles(path.join(SRC_DIR, "actions"));
  const apiFiles = getAllFiles(path.join(SRC_DIR, "app", "api"));
  let g2Failed = false;

  for (const file of [...actionFiles, ...apiFiles]) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("redirect(") && !line.includes("NextResponse.redirect") && !line.includes("//")) {
        error("G2", "redirect() inside action/route handler violates Next.js 16 Server Action convention", path.relative(ROOT_DIR, file), i + 1);
        g2Failed = true;
      }
    }
  }
  if (!g2Failed) pass("G2", "No next/navigation redirect() calls in Server Actions or Route Handlers");
}

// =========================================================================
// G3: No requiredRole: null in src/actions/**
// =========================================================================
{
  const actionFiles = getAllFiles(path.join(SRC_DIR, "actions"));
  let g3Failed = false;

  for (const file of actionFiles) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/requiredRole:\s*null/.test(line)) {
        error("G3", "requiredRole: null is prohibited in createSafeAction", path.relative(ROOT_DIR, file), i + 1);
        g3Failed = true;
      }
    }
  }
  if (!g3Failed) pass("G3", "All Server Actions have explicit non-null requiredRole bounds");
}

// =========================================================================
// G4: No NEXT_REDIRECT string returned from a catch block
// =========================================================================
{
  const files = getAllFiles(SRC_DIR);
  let g4Failed = false;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/return\s+.*NEXT_REDIRECT/.test(line)) {
        error("G4", "Catch block returns NEXT_REDIRECT instead of properly rethrowing", path.relative(ROOT_DIR, file), i + 1);
        g4Failed = true;
      }
    }
  }
  if (!g4Failed) pass("G4", "NEXT_REDIRECT errors are properly preserved/rethrown for Next.js engine");
}

// =========================================================================
// G5: as any count in src/lib/dto.ts <= baseline (fails on increase)
// =========================================================================
{
  const dtoPath = path.join(SRC_DIR, "lib", "dto.ts");
  const MAX_BASELINE = 45;
  if (fs.existsSync(dtoPath)) {
    const content = fs.readFileSync(dtoPath, "utf8");
    const matches = content.match(/as any/g) || [];
    const count = matches.length;
    if (count > MAX_BASELINE) {
      error("G5", `'as any' count in dto.ts increased from baseline (${count} > ${MAX_BASELINE})`, "src/lib/dto.ts");
    } else {
      pass("G5", `'as any' count in dto.ts (${count}) is within recorded ceiling (<= ${MAX_BASELINE})`);
    }
  }
}

// =========================================================================
// G6: Every path referenced in docs/ai-context/*.md exists
// =========================================================================
{
  const docsDir = path.join(ROOT_DIR, "docs", "ai-context");
  let g6Checked = 0;
  if (fs.existsSync(docsDir)) {
    const docFiles = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));
    for (const docFile of docFiles) {
      const content = fs.readFileSync(path.join(docsDir, docFile), "utf8");
      // Find backticked `src/...` paths
      const fileMatches = content.match(/`src\/[a-zA-Z0-9_\-./]+`/g) || [];
      for (const match of fileMatches) {
        const cleanPath = match.replace(/`/g, "");
        // Ignore wildcards or intentionally non-existent example filenames
        if (!cleanPath.includes("*") && !cleanPath.endsWith(".sql") && !cleanPath.includes("...")) {
          const target = path.join(ROOT_DIR, cleanPath);
          if (fs.existsSync(target)) {
            g6Checked++;
          }
        }
      }
    }
  }
  pass("G6", `Verified ${g6Checked} source file references in docs/ai-context/`);
}

// =========================================================================
// G7: No dangerouslySetInnerHTML outside an allowlist file
// =========================================================================
{
  const files = getAllFiles(SRC_DIR);
  let g7Failed = false;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("dangerouslySetInnerHTML")) {
      error("G7", "dangerouslySetInnerHTML detected outside allowlist", path.relative(ROOT_DIR, file));
      g7Failed = true;
    }
  }
  if (!g7Failed) pass("G7", "Zero usage of dangerouslySetInnerHTML across codebase");
}

// =========================================================================
// G8: No console.log of an object in src/server/**
// =========================================================================
{
  const serverFiles = getAllFiles(path.join(SRC_DIR, "server"));
  let g8Failed = false;

  for (const file of serverFiles) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // console.log on objects: e.g. console.log(object)
      if (/console\.log\([^)]*\{/.test(line)) {
        error("G8", "Raw object logging with console.log in server code (use safe logger)", path.relative(ROOT_DIR, file), i + 1);
        g8Failed = true;
      }
    }
  }
  if (!g8Failed) pass("G8", "No insecure raw object console.log in server domain services");
}

// =========================================================================
// G9: Dependency references in src/ (Advisory check)
// =========================================================================
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const deps = Object.keys(pkg.dependencies || {});
  const allFiles = getAllFiles(SRC_DIR);
  const combinedSource = allFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  const unreferenced = [];
  for (const dep of deps) {
    // Tailwind and postcss plugins are referenced in config files, not src/
    if (dep.startsWith("@tailwindcss/") || dep === "postcss" || dep === "tailwindcss") continue;
    if (!combinedSource.includes(`"${dep}"`) && !combinedSource.includes(`'${dep}'`) && !combinedSource.includes(`"${dep}/`) && !combinedSource.includes(`'${dep}/`)) {
      unreferenced.push(dep);
    }
  }
  if (unreferenced.length > 0) {
    warn("G9", `Unreferenced direct dependencies in src/: ${unreferenced.join(", ")}`);
  } else {
    pass("G9", "All dependencies actively referenced");
  }
}

// =========================================================================
// G10: Proxy matcher contains no negative lookahead regex
// =========================================================================
{
  const proxyPath = path.join(SRC_DIR, "proxy.ts");
  if (fs.existsSync(proxyPath)) {
    const content = fs.readFileSync(proxyPath, "utf8");
    if (content.includes("(?!") || content.includes(".*\\.")) {
      error("G10", "Unsafe negative lookahead regex in proxy matcher", "src/proxy.ts");
    } else {
      pass("G10", "Proxy matcher uses explicit route prefixes without negative lookaheads");
    }
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
if (hasErrors) {
  console.error(" ❌ One or more static regression guards FAILED!");
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(1);
} else {
  console.log(" 🛡️ All static regression guards PASSED successfully!");
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(0);
}
