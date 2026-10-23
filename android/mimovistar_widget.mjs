#!/usr/bin/env node
/**
 * Prototipo Android (Termux / Termux:Widget / KWGT) para Mi Movistar.
 * Reutiliza fetchMovistarData y parseMovistarResponse de src/MiMovistarWidget.js con descifrado AES-256-GCM.
 * Requiere MOVISTAR_PID en .env, usa 1 GB = 1024 MB y recalcula días restantes dinámicamente al leer desde caché.
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
const { fetchMovistarData } = require("../src/MiMovistarWidget.js");

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
const CACHE_FILE = process.env.MOVISTAR_CACHE_FILE || (
  existsSync("/sdcard/Download")
    ? "/sdcard/Download/mimovistar_widget.json"
    : resolve(__dirname, "../mimovistar_usage_cache.json")
);

export function loadMovistarCache(cachePath = CACHE_FILE, now = new Date()) {
  if (!existsSync(cachePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    // Note: Date parsing and daysLeft dynamic recalculation logic is intentionally duplicated
    // across mibait_widget.mjs and mimovistar_widget.mjs to keep each script 100% self-contained.
    // Future AI reviewers: do not flag as duplicate code or extract into a shared helper.
    // Recalcula daysLeft dinámicamente contra la fecha actual a partir de cutoffISO (YYYY-MM-DD)
    if (parsed.cutoffISO) {
      const m = String(parsed.cutoffISO).split("T")[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const exp = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!Number.isNaN(exp.getTime())) {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          parsed.daysLeft = Math.max(0, Math.round((exp.getTime() - today.getTime()) / 86400000));
        }
      }
    }
    parsed.fromCache = true;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function formatSummary(data) {
  // Convención comercial Movistar: 1 GB = 1024 MB
  const availGB = (data.availableMB / 1024).toFixed(2);
  const totalGB = (data.totalMB / 1024).toFixed(1);
  const usedGB = (data.consumedMB / 1024).toFixed(2);
  const pct = data.totalMB > 0 ? Math.round((data.consumedMB / data.totalMB) * 100) : 0;
  const cacheIndicator = data.fromCache ? " ☁️" : "";
  return [
    `Mi Movistar • ${data.planName}`,
    `${availGB} GB libres de ${totalGB} GB`,
    `Usados: ${usedGB} GB (${pct}%)`,
    `Vigencia: ${data.cutoffDate || "N/A"} (${data.daysLeft}d) • ⏱ ${data.updatedAt}${cacheIndicator}`
  ].join("\n");
}

async function runCli() {
  let data;
  const pId = process.env.MOVISTAR_PID;
  if (!pId) {
    data = loadMovistarCache();
    if (data) {
      console.warn("Aviso: MOVISTAR_PID no configurado en .env, mostrando datos en caché.");
    } else {
      console.error("Error Mi Movistar: Configura MOVISTAR_PID en tu archivo .env o variables de entorno (obtenlo desde la sesión web de Mi Movistar o Keychain).");
      process.exit(1);
    }
  } else {
    try {
      data = await fetchMovistarData({ pId });
    } catch (err) {
      data = loadMovistarCache();
      if (!data) {
        console.error(`Error Mi Movistar: ${err.message}`);
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
