#!/usr/bin/env node
/**
 * Prototipo Android (Termux / Termux:Widget / KWGT) para Mi AT&T.
 * Reutiliza fetchATTData y parseATTResponse de src/MiATTWidget.js.
 * Usa cifrado AES-256-CBC con derivación EVP_BytesToKey (MD5), 1 GB = 1024 MB y recalcula días restantes dinámicamente al leer desde caché.
 * Script autónomo para Termux / KWGT; desacoplado de otros scripts para ejecución independiente.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

globalThis.Color ??= class { constructor(hex) { this.hex = hex; } };
const require = createRequire(import.meta.url);
const { fetchATTData } = require("../src/MiATTWidget.js");

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
const CACHE_FILE = process.env.ATT_CACHE_FILE || (
  existsSync("/sdcard/Download")
    ? "/sdcard/Download/miatt_widget.json"
    : resolve(__dirname, "../miatt_usage_cache.json")
);

export function loadATTCache(cachePath = CACHE_FILE, now = new Date()) {
  if (!existsSync(cachePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
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
  // Convención comercial AT&T: 1 GB = 1024 MB
  const isUnlimitedPlan = data.totalMB === 0 && (String(data.planName || "").toLowerCase().includes("ilimitado") || data.unlimited);
  const availGB = (data.availableMB / 1024).toFixed(2);
  const totalGB = (data.totalMB / 1024).toFixed(1);
  const usedGB = (data.consumedMB / 1024).toFixed(2);
  const pct = data.totalMB > 0 ? Math.round((data.consumedMB / data.totalMB) * 100) : 0;
  const cacheIndicator = data.fromCache ? " ☁️" : "";

  const lines = [`Mi AT&T • ${data.planName}`];
  if (isUnlimitedPlan) {
    lines.push("Datos Ilimitados");
    lines.push(`Usados: ${usedGB} GB`);
  } else {
    lines.push(`${availGB} GB libres de ${totalGB} GB`);
    lines.push(`Usados: ${usedGB} GB (${pct}%)`);
  }
  lines.push(`Corte: ${data.cutoffDate || "N/A"} (${data.daysLeft}d) • ⏱ ${data.updatedAt}${cacheIndicator}`);

  return lines.join("\n");
}

async function runCli() {
  let data;
  const phone = process.env.ATT_PHONE;
  const pass = process.env.ATT_PASS;
  if (!phone || !pass) {
    data = loadATTCache();
    if (data) {
      console.warn("Aviso: ATT_PHONE o ATT_PASS no configurados en .env, mostrando datos en caché.");
    } else {
      console.error("Error Mi AT&T: Configura ATT_PHONE y ATT_PASS en tu archivo .env o variables de entorno.");
      process.exit(1);
    }
  } else {
    try {
      data = await fetchATTData({ phone, password: pass });
    } catch (err) {
      data = loadATTCache();
      if (!data) {
        console.error(`Error Mi AT&T: ${err.message}`);
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
