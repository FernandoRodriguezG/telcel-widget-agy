#!/usr/bin/env node
/**
 * Prototipo Android (Termux / Termux:Widget / KWGT) para Mi Telcel.
 * Reutiliza el parser de src/MiTelcelWidget.js y conserva los headers móviles
 * y revocación SSO obligatoria para evitar bloqueos de sesión en Telcel.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

globalThis.Color ??= class { constructor(hex) { this.hex = hex; } };
const require = createRequire(import.meta.url);
const { fetchTelcelData } = require("../src/MiTelcelWidget.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
// shortcut: lee .env por líneas simples KEY=VALUE sin librerías externas, migrar a dotenv si se usan valores multilínea
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const CACHE_FILE = process.env.TELCEL_CACHE_FILE || (
  existsSync("/sdcard/Download")
    ? "/sdcard/Download/mitelcel_widget.json"
    : resolve(__dirname, "../mitelcel_usage_cache.json")
);

export function fetchTelcelAndroid(phone, password) {
  return fetchTelcelData({ phone, password });
}

export function formatSummary(data) {
  const availGB = (data.availableMB / 1000).toFixed(2);
  const totalGB = (data.totalMB / 1000).toFixed(1);
  const usedGB = (data.consumedMB / 1000).toFixed(2);
  const pct = data.totalMB > 0 ? Math.round((data.consumedMB / data.totalMB) * 100) : 0;
  return [
    `Mi Telcel • ${data.planName}`,
    `${availGB} GB libres de ${totalGB} GB`,
    `Usados: ${usedGB} GB (${pct}%)`,
    `Corte: ${data.cutoffDate || "N/A"} (${data.daysLeft}d) • ⏱ ${data.updatedAt}`
  ].join("\n");
}

async function runCli() {
  let data;
  try {
    data = await fetchTelcelAndroid(process.env.TELCEL_PHONE, process.env.TELCEL_PASS);
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    if (existsSync(CACHE_FILE)) {
      data = { ...JSON.parse(readFileSync(CACHE_FILE, "utf8")), fromCache: true };
    } else {
      console.error(`Error Mi Telcel: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(formatSummary(data));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
