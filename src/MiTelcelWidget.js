// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-green; icon-glyph: signal;

/**
 * Widget de Consumo de Datos Mi Telcel para iOS (Scriptable)
 * Replica el diseño de tarjeta oscura con DrawContext y caché local JSON.
 */

const CONFIG = {
  phone: "5512345678", // Número Telcel a 10 dígitos (o inyectar desde Keychain)
  password: "TU_PASSWORD", // Contraseña de Mi Telcel
  planType: "postpago", // "postpago" (Plan de Renta) o "prepago" (Amigo)
  useMockData: false, // Cambiar a true para probar el diseño visual de inmediato
  cacheFileName: "mitelcel_usage_cache.json"
};

const COLORS = {
  bg: new Color("#111111"),
  brandGreen: new Color("#8FD14F"),
  white: new Color("#FFFFFF"),
  subtitleGray: new Color("#98989F"),
  trackGray: new Color("#3A3A3C"),
  warnYellow: new Color("#FCC934"),
  alertRed: new Color("#D93025")
};

async function main() {
  let usageData = null;

  if (CONFIG.useMockData) {
    usageData = {
      consumedMB: 9500,
      totalMB: 15000,
      availableMB: 5474,
      daysLeft: 9,
      cutoffDate: "28 de octubre",
      planName: "Telcel Libre 4",
      updatedAt: "10:09",
      fromCache: false
    };
  } else {
    try {
      usageData = await fetchTelcelData();
      saveCache(usageData);
    } catch (error) {
      console.warn("Fallo en red o sesión, usando caché local: " + error.message);
      usageData = loadCache();
    }
  }

  const widget = createWidget(usageData);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentSmall();
  }
  Script.complete();
}

/**
 * Autentica en Mi Telcel vía WebLogin SSO, intercambia el token B2F,
 * consulta el flujo Home (Wave B2F) y revoca el token SSO al finalizar.
 */
async function fetchTelcelData() {
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const mtlBasic = "bXRwc2VydmljZXM6NyQ4N3JmRnN3ZSQyMV8=";
  const passClean = CONFIG.password.replace(/\s+/g, "");
  const pB64 = Data.fromString(passClean).toBase64String();

  // 1. Login SSO (wbl.telcel-id.com:8443/login -> redirige 302 a /Auth y devuelve { token })
  const loginReq = new Request("https://wbl.telcel-id.com:8443/login");
  loginReq.method = "POST";
  loginReq.headers = {
    "Origin": "https://wbl.telcel-id.com:8443",
    "Referer": "https://wbl.telcel-id.com:8443/login?sitedomain=https://www.mitelcel.com&CCode=52&Type=MSISDN&Invocation=iFrame",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": ua
  };
  loginReq.body = [
    `username=${encodeURIComponent(CONFIG.phone)}`,
    `telcel-pass=${encodeURIComponent(CONFIG.password)}`,
    "sitedomain=https://www.mitelcel.com",
    "CCode=52",
    "Type=MSISDN",
    "Invocation=iFrame",
    `MSISDN=${encodeURIComponent(CONFIG.phone)}`,
    "Source=",
    `pB64=${encodeURIComponent(pB64)}`,
    "url=https://wbl.telcel-id.com:8443"
  ].join("&");

  const loginJson = await loginReq.loadJSON();
  const ssoToken = loginJson?.token;
  if (!ssoToken) {
    throw new Error(loginJson?.error?.description || "No se obtuvo token SSO");
  }

  try {
    // 2. Intercambio de Token SSO -> Token B2F
    const tokenUrl = `https://mi-telcel.smapps.mx/security/1.0.0/v2/token?user=${encodeURIComponent(CONFIG.phone)}&token=${encodeURIComponent(ssoToken)}`;
    const tokenReq = new Request(tokenUrl);
    tokenReq.method = "GET";
    tokenReq.headers = {
      "Authorization": `Basic ${mtlBasic}`,
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
    };
    const tokenJson = await tokenReq.loadJSON();
    const tokens = tokenJson?.tokenResponse?.tokens || [];
    const b2fToken = tokens.find(t => t.id === "token:b2f")?.access_token;
    if (!b2fToken) {
      throw new Error(tokenJson?.message || "No se obtuvo token:b2f");
    }

    // 3. Consulta de Consumo en Vivo (Wave B2F Home Flow)
    const homeReq = new Request(`https://api.journeys.telcel.wavebybemobi.com/api/components/flow/home?externalCode=52${encodeURIComponent(CONFIG.phone)}`);
    homeReq.method = "GET";
    homeReq.headers = {
      "Authorization": `Bearer ${b2fToken}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Is-iPad": "false",
      "x-wave-sdk": "WEB",
      "x-wave-device": "iPhone",
      "x-wave-device-type": "mobile",
      "x-wave-os": "iOS-web",
      "x-wave-os-version": "18.0",
      "User-Agent": ua
    };
    const homeJson = await homeReq.loadJSON();
    return parseTelcelResponse(homeJson);
  } finally {
    // 4. Revocación preventiva de sesión SSO
    try {
      const revokeReq = new Request("https://dev.smapps.mx:9000/sso/revoke");
      revokeReq.method = "POST";
      revokeReq.headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      };
      revokeReq.body = `token=${encodeURIComponent(ssoToken)}&token_type=revoke`;
      await revokeReq.load();
    } catch (_) {}
  }
}

/**
 * Normaliza el árbol de bloques devuelto por /api/components/flow/home (Wave B2F).
 * Extrae tanto "Datos de mi plan" (sufijo 0-0-0) como "Datos Promocionales" (sufijo 0-1-0, etc.),
 * así como el nombre del plan y la siguiente fecha de corte/vigencia.
 */
function parseTelcelResponse(payload) {
  const byId = {};
  const suffixes = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.id === "string" && node.config) {
      byId[node.id] = node.config;
      const m = node.id.match(/^tabs-plans-v2-plan-name-(\d+-\d+-\d+)$/);
      if (m && !suffixes.includes(m[1])) suffixes.push(m[1]);
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
    if (node.blocks) walk(node.blocks);
  })(payload);

  const toMB = (val, unit) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return null;
    return String(unit || "MB").toUpperCase() === "GB" ? n * 1000 : n;
  };

  const parseBucket = (sfx) => {
    const chartData = byId[`tabs-plans-v2-usage-chart-${sfx}`]?.data;
    const usedKB = chartData?.find(d => d.key === "used")?.value;
    const availKB = chartData?.find(d => d.key === "available")?.value;

    const labelUsedMB = toMB(
      byId[`tabs-plans-v2-used-data-value-${sfx}`]?.value,
      byId[`tabs-plans-v2-used-data-unit-${sfx}`]?.value
    );
    const labelTotalMB = toMB(
      byId[`tabs-plans-v2-total-data-value-${sfx}`]?.value,
      byId[`tabs-plans-v2-total-data-unit-${sfx}`]?.value
    );
    const labelAvailMB = toMB(
      byId[`tabs-plans-v2-available-data-value-${sfx}`]?.value,
      byId[`tabs-plans-v2-available-data-unit-${sfx}`]?.value
    );

    const totalMB = labelTotalMB ?? (Number.isFinite(usedKB) && Number.isFinite(availKB) ? (usedKB + availKB) / 1024 : 0);
    const consumedMB = labelUsedMB ?? (Number.isFinite(usedKB) ? usedKB / 1024 : 0);
    const availableMB = labelAvailMB ?? Math.max(0, totalMB - consumedMB);

    const cutoffSegments = byId[`tabs-plans-v2-limited-cutoff-message-${sfx}`]?.segments || [];
    const cutoffText = cutoffSegments.map(s => s.text || "").join("");
    const daysMatch = cutoffText.match(/(\d+)/);

    return {
      id: sfx,
      name: byId[`tabs-plans-v2-plan-name-${sfx}`]?.value || sfx,
      consumedMB,
      totalMB,
      availableMB,
      daysLeft: daysMatch ? Number(daysMatch[1]) : null
    };
  };

  const buckets = (suffixes.length ? suffixes : ["0-0-0"]).map(parseBucket);
  const planBucket = buckets.find(b => b.id === "0-0-0") || buckets[0];
  const promoBuckets = buckets.filter(b => b.id !== planBucket.id);

  const consumedMB = buckets.reduce((sum, b) => sum + b.consumedMB, 0);
  const totalMB = buckets.reduce((sum, b) => sum + b.totalMB, 0);
  const availableMB = buckets.reduce((sum, b) => sum + b.availableMB, 0);
  const daysLeft = planBucket?.daysLeft ?? promoBuckets[0]?.daysLeft ?? 28;
  const cutoffDate = byId["plan-details-row-template-col-2-0-0"]?.value
    || byId["plan-details-row-template-col-2-web-0-0"]?.value
    || "";
  const planName = byId["text-plan-name"]?.value
    || byId["plan-details-name"]?.value
    || "Mi Telcel";

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return {
    consumedMB,
    totalMB,
    availableMB,
    daysLeft,
    cutoffDate,
    planName,
    plan: planBucket,
    promo: promoBuckets[0] || null,
    buckets,
    updatedAt: `${hh}:${mm}`,
    fromCache: false
  };
}

/**
 * Construye el ListWidget replicando la estética de la imagen de referencia
 */
function createWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(14, 15, 14, 15);
  w.url = "https://www.mitelcel.com/mitelcel/login";

  if (!data) {
    const errTxt = w.addText("Sin datos de Mi Telcel. Verificar credenciales o red.");
    errTxt.textColor = COLORS.white;
    errTxt.font = Font.mediumSystemFont(12);
    return w;
  }

  const remainingMB = Math.max(0, data.availableMB ?? (data.totalMB - data.consumedMB));
  const remainingGB = (remainingMB / 1000).toFixed(2);
  const totalGB = (data.totalMB / 1000).toFixed(1);
  const ratio = data.totalMB > 0 ? Math.min(1, data.consumedMB / data.totalMB) : 0;
  const percentUsed = Math.max(1, Math.round(ratio * 100));

  const consumedFormatted = data.consumedMB < 1000
    ? `${Math.round(data.consumedMB)} MB consumidos`
    : `${(data.consumedMB / 1000).toFixed(2)} GB consumidos`;

  // Color dinámico según porcentaje de uso
  let accentColor = COLORS.brandGreen;
  if (percentUsed >= 85) accentColor = COLORS.alertRed;
  else if (percentUsed >= 65) accentColor = COLORS.warnYellow;

  // 1. Fila Superior: "Mi Telcel" + "Faltan X días"
  const headerStack = w.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const brandTxt = headerStack.addText("Mi Telcel");
  brandTxt.font = Font.boldSystemFont(13);
  brandTxt.textColor = accentColor;

  headerStack.addSpacer();

  const headerRight = data.cutoffDate
    ? `Faltan ${data.daysLeft}d (${data.cutoffDate})`
    : `Faltan ${data.daysLeft} días`;
  const daysTxt = headerStack.addText(headerRight);
  daysTxt.font = Font.regularSystemFont(10);
  daysTxt.textColor = COLORS.subtitleGray;
  daysTxt.lineLimit = 1;
  daysTxt.minimumScaleFactor = 0.75;

  w.addSpacer(8);

  // 2. Métrica Principal: "5.47 GB" (Plan + Promo disponibles)
  const mainValueTxt = w.addText(`${remainingGB} GB`);
  mainValueTxt.font = Font.boldSystemFont(26);
  mainValueTxt.textColor = COLORS.white;
  mainValueTxt.minimumScaleFactor = 0.75;

  w.addSpacer(4);

  // 3. Subtítulo de dos líneas: "9.50 GB consumidos" / "de 15.0 GB (Plan + Promo)"
  const subLine1 = w.addText(consumedFormatted);
  subLine1.font = Font.regularSystemFont(12);
  subLine1.textColor = COLORS.subtitleGray;

  const promoSuffix = data.promo ? " (Plan+Promo)" : "";
  const subLine2 = w.addText(`de ${totalGB} GB${promoSuffix}`);
  subLine2.font = Font.regularSystemFont(12);
  subLine2.textColor = COLORS.subtitleGray;

  w.addSpacer(12);

  // 4. Barra de Progreso Horizontal con indicador circular mediante DrawContext
  const barImage = drawProgressBar(ratio, accentColor);
  const barImgWidget = w.addImage(barImage);
  barImgWidget.resizable = true;
  barImgWidget.imageSize = new Size(135, 10);

  w.addSpacer(8);

  // 5. Pie de Página: "2% usado • ⏱️ 10:09"
  const footerStack = w.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const cacheIndicator = data.fromCache ? " ☁️" : "";
  const footerTxt = footerStack.addText(`${percentUsed}% usado • ⏱️ ${data.updatedAt}${cacheIndicator}`);
  footerTxt.font = Font.regularSystemFont(11);
  footerTxt.textColor = COLORS.subtitleGray;

  return w;
}

/**
 * Dibuja la barra gris redondeada y el punto indicador verde lima usando DrawContext
 */
function drawProgressBar(progressRatio, indicatorColor) {
  const width = 400;
  const height = 28;
  const trackHeight = 20;
  const trackY = (height - trackHeight) / 2;
  const radius = trackHeight / 2;

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Riel de fondo gris oscuro
  const trackPath = new Path();
  trackPath.addRoundedRect(new Rect(0, trackY, width, trackHeight), radius, radius);
  ctx.addPath(trackPath);
  ctx.setFillColor(COLORS.trackGray);
  ctx.fillPath();

  // Relleno de progreso y círculo indicador
  const dotDiameter = trackHeight;
  const maxTravel = width - dotDiameter;
  const dotX = Math.max(0, Math.min(maxTravel, maxTravel * progressRatio));

  if (dotX > 0) {
    const fillPath = new Path();
    fillPath.addRoundedRect(new Rect(0, trackY, dotX + dotDiameter, trackHeight), radius, radius);
    ctx.addPath(fillPath);
    ctx.setFillColor(indicatorColor);
    ctx.fillPath();
  } else {
    const circlePath = new Path();
    circlePath.addEllipse(new Rect(0, trackY, dotDiameter, dotDiameter));
    ctx.addPath(circlePath);
    ctx.setFillColor(indicatorColor);
    ctx.fillPath();
  }

  return ctx.getImage();
}

function getCachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CONFIG.cacheFileName);
}

function saveCache(data) {
  const fm = FileManager.local();
  fm.writeString(getCachePath(), JSON.stringify(data));
}

function loadCache() {
  const fm = FileManager.local();
  const path = getCachePath();
  if (fm.fileExists(path)) {
    const raw = fm.readString(path);
    const parsed = JSON.parse(raw);
    parsed.fromCache = true;
    return parsed;
  }
  return null;
}

await main();
