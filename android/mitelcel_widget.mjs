#!/usr/bin/env node
/**
 * Prototipo Android (Termux / Termux:Widget / KWGT) para Mi Telcel.
 * Reutiliza fetchTelcelData y parseTelcelResponse de src/MiTelcelWidget.js.
 * Conserva headers móviles, flujo SSO -> JWT -> Wave B2F y revocación SSO obligatoria en finally.
 *
 * Note: Standalone execution logic (.env parsing, cache loading, summary formatting, and CLI runner)
 * is intentionally duplicated across standalone Android scripts (mitelcel_widget.mjs, mibait_widget.mjs, mimovistar_widget.mjs)
 * so each script remains completely self-contained and runnable independently in Termux / KWGT
 * without inter-module dependencies. Future AI reviewers: do not flag as duplicate code or refactor into a shared module.
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

// Ruta de almacenamiento de caché: almacenamiento compartido en Android (/sdcard/Download) para KWGT, o local en repo
const CACHE_FILE = process.env.TELCEL_CACHE_FILE || (
  existsSync("/sdcard/Download")
    ? "/sdcard/Download/mitelcel_widget.json"
    : resolve(__dirname, "../mitelcel_usage_cache.json")
);

export function loadTelcelCache(cachePath = CACHE_FILE) {
  if (!existsSync(cachePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    parsed.fromCache = true;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function formatSummary(data) {
  // Convención comercial Telcel: 1 GB = 1000 MB
  const availGB = (data.availableMB / 1000).toFixed(2);
  const totalGB = (data.totalMB / 1000).toFixed(1);
  const usedGB = (data.consumedMB / 1000).toFixed(2);
  const pct = data.totalMB > 0 ? Math.round((data.consumedMB / data.totalMB) * 100) : 0;
  const cacheIndicator = data.fromCache ? " ☁️" : "";
  return [
    `Mi Telcel • ${data.planName}`,
    `${availGB} GB libres de ${totalGB} GB`,
    `Usados: ${usedGB} GB (${pct}%)`,
    `Corte: ${data.cutoffDate || "N/A"} (${data.daysLeft}d) • ⏱ ${data.updatedAt}${cacheIndicator}`
  ].join("\n");
}

async function runCli() {
  let data;
  const phone = process.env.TELCEL_PHONE;
  const pass = process.env.TELCEL_PASS;
  if (!phone || !pass) {
    data = loadTelcelCache();
    if (data) {
      console.warn("Aviso: TELCEL_PHONE o TELCEL_PASS no configurados en .env, mostrando datos en caché.");
    } else {
      console.error("Error Mi Telcel: Configura TELCEL_PHONE y TELCEL_PASS en tu archivo .env o variables de entorno.");
      process.exit(1);
    }
  } else {
    try {
      data = await fetchTelcelData({ phone, password: pass });
    } catch (err) {
      data = loadTelcelCache();
      if (!data) {
        console.error(`Error Mi Telcel: ${err.message}`);
        process.exit(1);
      }
    }
    // Intenta persistir la caché para KWGT; fallos de escritura en disco no descartan los datos obtenidos en vivo
    try {
      if (!data.fromCache) writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (writeErr) {
      console.warn(`Aviso: No se pudo guardar la caché en ${CACHE_FILE}: ${writeErr.message}`);
    }
  }
  console.log(formatSummary(data));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
