# Guía del Proyecto: Mi Telcel iOS Widget & API Probe

## Reglas de Seguridad y Sesión
- **NUNCA** leas, imprimas ni incluyas el contenido del archivo `.env` o `cookies.txt` en tus respuestas o artefactos.
- Para probar los endpoints de Telcel, utiliza exclusivamente la skill `.agents/skills/telcel-api-probe/SKILL.md` (o el comando `/telcel-api-probe`).
- El backend de Mi Telcel bloquea sesiones concurrentes si no se revoca el token SSO al finalizar (`POST https://dev.smapps.mx:9000/sso/revoke`). El script `probe_telcel.sh` ya incluye un `trap` de salida para garantizar el cierre de sesión.

## Flujo de Trabajo del Agente
1. Ejecuta `.agents/skills/telcel-api-probe/scripts/probe_telcel.sh`.
2. Inspecciona únicamente el esquema sanitizado generado en `artifacts/schema_summary.json` y el resumen en `artifacts/probe_report.txt` (o los JSON en `artifacts/` si el usuario lo autoriza). Consulta [`Telcel Widget API.md`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/Telcel%20Widget%20API.md) para la especificación de bloques Wave B2F.
3. Con base en las llaves reales del JSON devuelto por Telcel (`api.journeys.telcel.wavebybemobi.com/api/components/flow/home`), actualiza [`MiTelcelWidget/TelcelNetworkService.swift`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/MiTelcelWidget/TelcelNetworkService.swift) y `parseTelcelResponse(payload)` en [`src/MiTelcelWidget.js`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/src/MiTelcelWidget.js) para sumar todas las bolsas de datos (`0-0-0` Plan Base + `0-1-0` Datos Promocionales) y extraer la fecha de corte (`plan-details-row-template-col-2-0-0`).
4. Si el flujo de login SSO (`wbl.telcel-id.com:8443/login`) o el intercambio de token (`mi-telcel.smapps.mx/security/1.0.0/v2/token`) cambia, utiliza el navegador integrado para inspeccionar el iframe/bundle o indica al usuario cómo capturar el comando cURL.
