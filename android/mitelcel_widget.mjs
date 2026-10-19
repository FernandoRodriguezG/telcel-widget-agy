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
const { parseTelcelResponse } = require("../src/MiTelcelWidget.js");

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

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MTL_BASIC = "bXRwc2VydmljZXM6NyQ4N3JmRnN3ZSQyMV8=";

export async function fetchTelcelAndroid(phone, password) {
  if (!phone || !password) {
    throw new Error("Faltan TELCEL_PHONE o TELCEL_PASS en .env");
  }
  const passClean = password.replace(/\s+/g, "");
  const pB64 = Buffer.from(passClean, "utf8").toString("base64");

  // 1. Login SSO
  const loginRes = await fetch("https://wbl.telcel-id.com:8443/login", {
    method: "POST",
    headers: {
      "Origin": "https://wbl.telcel-id.com:8443",
      "Referer": "https://wbl.telcel-id.com:8443/login?sitedomain=https://www.mitelcel.com&CCode=52&Type=MSISDN&Invocation=iFrame",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA
    },
    body: new URLSearchParams({
      username: phone,
      "telcel-pass": password,
      sitedomain: "https://www.mitelcel.com",
      CCode: "52",
      Type: "MSISDN",
      Invocation: "iFrame",
      MSISDN: phone,
      Source: "",
      pB64,
      url: "https://wbl.telcel-id.com:8443"
    }).toString()
  });

  const loginJson = await loginRes.json();
  const ssoToken = loginJson?.token;
  if (!ssoToken) {
    throw new Error(loginJson?.error?.description || "No se obtuvo token SSO");
  }

  try {
    // 2. Intercambio de Token SSO -> Token B2F
    const tokenUrl = `https://mi-telcel.smapps.mx/security/1.0.0/v2/token?user=${encodeURIComponent(phone)}&token=${encodeURIComponent(ssoToken)}`;
    const tokenRes = await fetch(tokenUrl, {
      headers: {
        "Authorization": `Basic ${MTL_BASIC}`,
        "scope": "token:mit|token:b2f",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "App-Version": "0.14",
        "Code-Version": "38",
        "Device-Id": "DSK",
        "tipoRequest": "1",
        "Os": "WEB",
        "Os-Version": "13",
        "X-Channel": "web-browser",
        "User-Agent": "ktor-client"
      }
    });
    const tokenJson = await tokenRes.json();
    const tokens = tokenJson?.tokenResponse?.tokens || [];
    const b2fToken = tokens.find(t => t.id === "token:b2f")?.access_token;
    if (!b2fToken) {
      throw new Error(tokenJson?.message || "No se obtuvo token:b2f");
    }

    // 3. Consulta Wave B2F Home Flow
    const homeRes = await fetch(
      `https://api.journeys.telcel.wavebybemobi.com/api/components/flow/home?externalCode=52${encodeURIComponent(phone)}`,
      {
        headers: {
          "Authorization": `Bearer ${b2fToken}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-Is-iPad": "false",
          "x-wave-sdk": "WEB",
          "x-wave-device": "iPhone",
          "x-wave-device-type": "mobile",
          "x-wave-os": "iOS-web",
          "x-wave-os-version": "18.0",
          "User-Agent": UA
        }
      }
    );
    const homeJson = await homeRes.json();
    return parseTelcelResponse(homeJson);
  } finally {
    // 4. Revocación obligatoria de sesión SSO
    try {
      await fetch("https://dev.smapps.mx:9000/sso/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: `token=${encodeURIComponent(ssoToken)}&token_type=revoke`
      });
    } catch (_) {}
  }
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
