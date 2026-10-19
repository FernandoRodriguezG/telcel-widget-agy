Arquitectura, Ingeniería Inversa e Implementación de un Widget de Consumo de Datos de Mi Telcel para iOS

Análisis Forense de la Interfaz Objetivo y Estado del Ecosistema

El ecosistema oficial de aplicaciones móviles de América Móvil en México carece de una extensión moderna de *WidgetKit* capaz de presentar el consumo de datos en tiempo real con la densidad visual y limpieza estética mostradas en la imagen de referencia. La aplicación principal Mi Telcel (identificador de paquete `com.speedymovil.wire` en Android e ID `492764073` en el App Store de iOS, desarrollada por Speedy Movil S.A. de C.V. para Radiomóvil Dipsa S.A. de C.V.) alcanzó la versión 15.1.1 en octubre de 2026 con un peso de 112.6 MB y requerimiento de iOS 15.3 o superior. Aunque las actualizaciones comprendidas entre las versiones 14.4.2 y 14.5 renovaron la pantalla de inicio para integrar gráficas de consumo de datos, llamadas y SMS, la documentación oficial y el historial de versiones confirman la ausencia de soporte nativo para widgets de pantalla de inicio. Por su parte, la aplicación secundaria Consumo de Internet (ID `493302110`, de 432.1 KB) quedó congelada en su versión 4.0 desde agosto de 2017 y actualmente opera únicamente como un atajo que redirige la ejecución hacia la aplicación principal de Mi Telcel.

Un examen forense de la interfaz de usuario proporcionada en la consulta (`Mi Telcel`, `Faltan 28 días`, `22.40 GB`, `354 MB consumidos de 22.7 GB`, barra de progreso horizontal con indicador circular verde y pie de página `2% usado •` ⏱️ `10:09`) revela que no se trata de un componente nativo distribuido por la operadora, sino de un widget personalizado construido sobre la aplicación de automatización Scriptable para iOS. La estructura tipográfica, la disposición espacial y, de manera determinante, el formato del pie de página con el emoji de cronómetro (⏱️) seguido de la hora de última sincronización (`10:09`) corresponden a la adaptación al español de la familia de scripts de código abierto originalmente diseñada en Alemania para consultar el volumen de datos de Deutsche Telekom (`pass.telekom.de`) creada por los desarrolladores Sillium (`TelekomDataUsage.js`) y Marc Julian Schwarz (`telekom-data-usage-widget`).

En dichos desarrollos comunitarios, la imposibilidad de realizar consultas directas cuando el teléfono se conecta a una red Wi-Fi obligó a los autores a diseñar un sistema de almacenamiento en caché local mediante archivos JSON en iCloud Drive, añadiendo el icono ⏱️ junto a la marca de tiempo para informar al usuario si la cifra en pantalla proviene de una consulta en vivo o de una lectura almacenada en caché. A diferencia de los repositorios públicos para operadores europeos o asiáticos —como el proyecto `slt-data-remaining-widget-ios` para SLT Mobitel—, no existe en GitHub un repositorio público activo y empaquetado específicamente bajo el nombre de widget de Scriptable para Mi Telcel. Sin embargo, la combinación de clientes HTTP filtrados en GitHub Gists para el portal de Telcel y las plantillas de renderizado de `ListWidget` y `DrawContext` en Scriptable permite reconstruir íntegramente tanto la capa de red como la interfaz gráfica.

| Atributo Técnico | App Oficial: Mi Telcel (iOS) | App Legada: Consumo de Internet | Widget Personalizado (Scriptable) | Widget Nativo (Xcode WidgetKit) |
| ----- | ----- | ----- | ----- | ----- |
| Desarrollador / Motor | América Móvil / Speedy Movil S.A. de C.V. | América Móvil / Speedy Movil S.A. de C.V. | Motor JavaScript sobre app Scriptable | Compilación nativa Swift / SwiftUI en macOS |
| Versión / Estado (2026) | v15.1.1 (Activa, 112.6 MB, iOS 15.3+) | v4.0 (Obsoleta desde 2017, 432.1 KB) | Ejecución dinámica mediante script .js | Extensión .appex empaquetada en .ipa |
| Soporte de Widget iOS | Inexistente en pantalla de inicio | Inexistente (redirige a la app Mi Telcel) | Completo (systemSmall, Medium, Large) | Completo \+ Interactividad (AppIntents iOS 17+) |
| Persistencia de Firma | Permanente (App Store) | Permanente (App Store) | Permanente (alojado dentro de Scriptable) | 7 días (Cuenta Gratuita) o 1 año (Cuenta \$99 USD) |
| Mecanismo de Red | APIs REST privadas y enriquecimiento celular | Redirección mediante esquema de URL | Objeto Request con gestión de cookies y caché JSON | URLSession asíncrono dentro de TimelineProvider |

Ingeniería Inversa de la Conectividad y Endpoints de Mi Telcel

Telcel no ofrece una API pública ni tokens de desarrollador documentados para que los usuarios finales consulten el estado de su línea. En consecuencia, la extracción programática de los megabytes consumidos y la vigencia del ciclo de facturación requiere interactuar con la infraestructura interna de la operadora mediante una de tres vías técnicas: el consumo de los endpoints REST del portal web de autogestión (`mitelcel.com`), la interceptación de la API móvil de Speedy Movil, o la automatización de canales alternativos como USSD/SMS.

1\. API Web y Microservicios del Portal Mi Telcel (`wbl.telcel-id.com`, `mi-telcel.smapps.mx` y `wavebybemobi.com`)

Aunque el portal web `www.mitelcel.com` operó históricamente sobre una pila Java EE monolítica (`/mitelcel/login/auth` con cookies `JSESSIONID` y rutas bajo `/mitelcel/mitelcel-api-web/api/`, hoy deprecadas con respuesta `405 Not Allowed`), en 2026 la plataforma migró a una aplicación de página única (SPA en React/Vite) conectada a microservicios mediante tokens JWT:

1. **Autenticación SSO en Iframe (`wbl.telcel-id.com:8443`):** El formulario en `/login` se renderiza desde `https://wbl.telcel-id.com:8443/login?sitedomain=https://www.mitelcel.com&CCode=52&Type=MSISDN&Invocation=iFrame` y envía un `POST https://wbl.telcel-id.com:8443/login` (`application/x-www-form-urlencoded`) con `username`, `telcel-pass`, `pB64` (contraseña en Base64 sin espacios), `MSISDN`, `CCode=52`, `Type=MSISDN`, `Invocation=iFrame` y `sitedomain=https://www.mitelcel.com`. Devuelve un JSON con `{ "token": "<sso_token>" }`.
2. **Intercambio de Tokens (`mi-telcel.smapps.mx`):** Con el `<sso_token>`, el cliente invoca `GET https://mi-telcel.smapps.mx/security/1.0.0/v2/token?user={telefono}&token={sso_token}` enviando `Authorization: Basic bXRwc2VydmljZXM6NyQ4N3JmRnN3ZSQyMV8=` y `scope: token:mit|token:b2f`, obteniendo dos tokens JWT: `token:mit` (`MTL_TOKEN`) y `token:b2f` (`B2F_TOKEN`).
3. **Validación de Perfil y Consumo (Plan Base + Datos Promocionales + Fecha de Corte):** Con `MTL_TOKEN` y `B2F_TOKEN` se consulta el perfil de la línea (`POST /users/1.0.0/v2/info/validate`), los bloques de consumo en tiempo real del Home (`GET https://api.journeys.telcel.wavebybemobi.com/api/components/flow/home?externalCode=52{telefono}`), el detalle de consumo (`GET /users/1.0.0/consumption/v2/details`), los paquetes activos (`GET /packages/1.0.0/v2/active/list`) y la facturación/plan (`GET /services/1.0.0/v2/telcelBilling` o `GET /users/1.0.0/miPlan`). El árbol JSON de **Home Flow (Wave B2F)** entrega en una sola llamada todas las bolsas de datos activas mediante bloques identificados por sufijo `0-{indice}-0`:
   - **Datos de mi plan (`0-0-0`):** `tabs-plans-v2-total-data-value-0-0-0`, `tabs-plans-v2-used-data-value-0-0-0`, `tabs-plans-v2-available-data-value-0-0-0` y `tabs-plans-v2-usage-chart-0-0-0`.
   - **Datos Promocionales (`0-1-0`):** `tabs-plans-v2-plan-name-0-1-0` (ej. `"PROMO 50% DE DATOS 24 MDP"`), `tabs-plans-v2-total-data-value-0-1-0`, `tabs-plans-v2-used-data-value-0-1-0`, `tabs-plans-v2-available-data-value-0-1-0` y `tabs-plans-v2-usage-chart-0-1-0`.
   - **Vigencia y Fecha de Corte:** `tabs-plans-v2-limited-cutoff-message-0-0-0` (ej. `"Faltan 9 días para el próximo corte"`), `plan-details-row-template-col-2-0-0` (ej. `"28 de octubre"`) y `text-plan-name` (ej. `"Telcel Libre 4"`). Consulta la especificación completa en [`Telcel Widget API.md`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/Telcel%20Widget%20API.md).

| Operación / Recurso | Método HTTP | Endpoint Completo (Arquitectura 2026) | Parámetros y Cabeceras Requeridas |
| ----- | ----- | ----- | ----- |
| Inicio de Sesión SSO (WebLogin) | POST | `https://wbl.telcel-id.com:8443/login` | `Content-Type: application/x-www-form-urlencoded`; Cuerpo: `username`, `telcel-pass`, `pB64` (Base64), `MSISDN`, `CCode=52`, `Type=MSISDN`, `Invocation=iFrame`, `sitedomain=https://www.mitelcel.com` |
| Intercambio de Tokens (`mit` y `b2f`) | GET | `https://mi-telcel.smapps.mx/security/1.0.0/v2/token?user={telefono}&token={sso_token}` | `Authorization: Basic bXRwc2VydmljZXM6NyQ4N3JmRnN3ZSQyMV8=`; `scope: token:mit\|token:b2f`; `User-Agent: ktor-client` |
| Validación de Perfil y Cuenta | POST | `https://mi-telcel.smapps.mx/users/1.0.0/v2/info/validate` | `Authorization: Basic ...`; `Token: {mtl_token}`; Body JSON: `{"user":"{telefono}"}` |
| Consumo en Vivo / Home (Wave B2F) | GET | `https://api.journeys.telcel.wavebybemobi.com/api/components/flow/home?externalCode=52{telefono}` | `Authorization: Bearer {b2f_token}`; `x-wave-sdk: WEB`; `x-wave-os: macos-web` |
| Detalle de Consumo (Módulo Mensual) | GET | `https://mi-telcel.smapps.mx/users/1.0.0/consumption/v2/details?user={telefono}&profile={profile}&region={region}&typeRequest=getModule&account={account}` | `Authorization: Basic ...`; `Token: {mtl_token}`; `App-Version: 0.15`; `user`, `profile`, `region` |
| Paquetes Activos (Prepago / Pospago) | GET | `https://mi-telcel.smapps.mx/packages/1.0.0/v2/active/list?user={telefono}&profile={profile}&region={region}&isSuspended={isSuspended}` | `Authorization: Basic ...`; `Token: {mtl_token}`; `user`, `profile`, `region` |
| Facturación / Mi Plan (`telcelBilling` / `miPlan`) | GET | `https://mi-telcel.smapps.mx/services/1.0.0/v2/telcelBilling` o `/users/1.0.0/miPlan` | `Authorization: Basic ...`; `Token: {mtl_token}`; `user`, `profile`, `region`, `account` |
| Cierre de Sesión (Revoke SSO) | POST | `https://dev.smapps.mx:9000/sso/revoke` | `Content-Type: application/x-www-form-urlencoded`; Cuerpo: `token={sso_token}&token_type=revoke` |

Un aspecto operativo crítico al automatizar estas consultas es la gestión de la revocación del token SSO (`POST https://dev.smapps.mx:9000/sso/revoke`) al finalizar o la reutilización del token vigente antes de su expiración (`exp`). Si un widget ejecuta inicios de sesión nuevos continuamente sin revocar ni reutilizar tokens, la plataforma puede invalidar sesiones activas concurrentes.

Adicionalmente, `www.mitelcel.com` negocia conexiones sobre TLS 1.3 utilizando intercambio de claves híbrido post-cuántico (`X25519MLKEM768`), transparente para `URLSession` de iOS y `Request` de Scriptable.

2\. Interceptación de la API Móvil (`Speedy Movil`) y Consulta Sin Registro en Red Celular

Cuando el portal web introduce barreras como CAPTCHAs o tokens antifalsificación complejos en el flujo de inicio de sesión, la alternativa más robusta para un desarrollador con una MacBook Pro M3 consiste en consumir los endpoints utilizados directamente por la aplicación móvil Mi Telcel (`com.speedymovil.wire`). Auditorías de seguridad de redes sobre el ecosistema móvil de América Móvil revelan dos propiedades estructurales que facilitan enormemente esta integración.

En primer lugar, la plataforma soporta autenticación implícita por red celular (*Zero-Login Enrichment*). La descripción oficial de Mi Telcel tanto en el App Store como en Google Play establece explícitamente que, aun sin haberse registrado ni iniciado sesión con contraseña, el usuario puede consultar su saldo y consumo de Internet directamente al abrir la aplicación. Este mecanismo funciona cuando el iPhone está conectado directamente a la red de datos móviles de Telcel (con Wi-Fi, VPN e *iCloud Private Relay* desactivados), permitiendo que el gateway de América Móvil identifique la línea mediante inyección de cabeceras de red (MSISDN) o resolución de IP interna, de forma análoga a como opera el portal `pass.telekom.de` de Deutsche Telekom en Alemania.

En segundo lugar, investigaciones académicas de seguridad publicadas por *Citizen Lab* y *Open Tech Fund* (FOCI 2024 y POPETS 2026\) analizaron el tráfico de la aplicación Mi Telcel mediante `mitmproxy` y demostraron la viabilidad de interceptar sus llamadas de red sin obstáculos criptográficos insalvables. Dichos estudios documentaron que la aplicación carecía de un fijado de certificados (*SSL Certificate Pinning*) estricto que impidiera la inspección con un certificado raíz instalado en el dispositivo e incluso descargaba tres imágenes y archivos JSON de configuración inicial en texto plano (HTTP). Aprovechando el chip Apple Silicon M3 de la MacBook Pro, el desarrollador puede capturar el tráfico exacto de la versión 15.1.1 en menos de diez minutos ejecutando `mitmproxy` o *Proxyman* en macOS, configurando el proxy HTTP manual en la conexión Wi-Fi del iPhone e instalando el perfil de autoridad certificadora (CA) en el sistema. Al abrir la aplicación Mi Telcel y refrescar la pantalla principal (*Inicio*), el proxy revelará la petición hacia los servidores de Speedy Movil y Telcel (incluyendo dominios bajo `mitelcel.com` y `smapps.mx`) junto con el encabezado de autorización o token de sesión reutilizable en el widget.

Desglose Matemático y Visual del Widget de Referencia

Para replicar con exactitud la tarjeta mostrada en la imagen de referencia, es necesario formalizar tanto la lógica de transformación de datos como la jerarquía de componentes visuales. Los endpoints de consumo de Telcel devuelven los volúmenes de datos expresados en Megabytes (MB), Gigabytes (GB) o Kilobytes (KB), divididos entre la bolsa base del plan (`0-0-0`) y las bolsas promocionales (`0-1-0`), junto con la fecha de corte o expiración del paquete.

Sea ${C}_{MB} = {C}_{\text{plan}} + {C}_{\text{promo}}$ el volumen total de datos consumidos en megabytes y ${T}_{MB} = {T}_{\text{plan}} + {T}_{\text{promo}}$ la cuota total combinada (plan + promoción) en megabytes. El volumen restante en gigabytes (${R}_{GB}$), el porcentaje de uso (${P}_{usado}$) y los días restantes hasta la fecha de corte (${D}_{faltan}$) entre la fecha de corte ${t}_{corte}$ y el instante actual ${t}_{actual}$ se calculan mediante las siguientes expresiones:

${R}_{GB}=\frac{{T}_{MB}-{C}_{MB}}{1000}\quad\text{o bien}\quad{R}_{GB}=\frac{{A}_{\text{plan,MB}}+{A}_{\text{promo,MB}}}{1000}$

${P}_{usado}=\text{round}\left({\frac{{C}_{MB}}{{T}_{MB}}\times 100}\right)$

$$D_{\text{faltan}} = \left\lceil \frac{t_{\text{corte}} - t_{\text{actual}}}{86,400,000\text{ ms}} \right\rceil$$

En la línea validada (`Telcel Libre 4`), el plan base aporta $10\text{ GB}$ ($9.5\text{ GB}$ usados y $474\text{ MB}$ disponibles) y la promoción (`PROMO 50% DE DATOS 24 MDP`) aporta $5\text{ GB}$ adicionales ($0\text{ MB}$ usados y $5\text{ GB}$ disponibles), sumando un total de $15.0\text{ GB}$ (`de 15.0 GB (Plan+Promo)`), con $5.47\text{ GB}$ disponibles, $9.50\text{ GB}$ consumidos (`63% usado`) y corte el `28 de octubre` (`Faltan 9d (28 de octubre)`).

Ruta de Implementación 1: Automatización en JavaScript mediante Scriptable (Recomendada)

Para un uso personal continuo, Scriptable representa la vía arquitectónica óptima. Al tratarse de una aplicación distribuida oficialmente en el App Store, elimina por completo el vencimiento semanal de certificados de Xcode, permite almacenar las credenciales de Telcel de forma segura en el *Keychain* nativo de iOS, sincroniza el código desde la MacBook Pro M3 hacia el iPhone automáticamente a través de iCloud Drive y ejecuta actualizaciones periódicas en segundo plano administradas por el sistema operativo.

Renderizado de la Barra de Progreso y Estructura con `ListWidget` y `DrawContext`

El motor de widgets de Scriptable (`ListWidget`) no posee un componente nativo de barra de progreso con indicador circular superpuesto como el de la imagen de referencia; por ello, los desarrolladores utilizan la clase `DrawContext` para dibujar un lienzo vectorial en memoria con fondo transparente (`opaque = false`), trazar el riel gris redondeado, superponer el círculo verde lima en la coordenada proporcional al porcentaje consumido y exportar el resultado como una imagen (`getImage()`) que se inserta en una pila (`WidgetStack`).

Asimismo, el color del indicador y del título puede programarse para cambiar dinámicamente según el umbral de consumo (verde para consumo bajo, amarillo al superar el 60%, naranja al 80% y rojo al superar el 85% o 90%), replicando el comportamiento de los widgets de consumo de datos de referencia.

Código Fuente del Widget para Scriptable ([`src/MiTelcelWidget.js`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/src/MiTelcelWidget.js))

El script completo de JavaScript para Scriptable se encuentra en [`src/MiTelcelWidget.js`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/src/MiTelcelWidget.js). Implementa el flujo SSO 2026 (`wbl.telcel-id.com:8443/login` + `mi-telcel.smapps.mx/security/1.0.0/v2/token`), la consulta al endpoint Wave B2F (`api.journeys.telcel.wavebybemobi.com/api/components/flow/home`), la suma automática de **Datos de mi plan (`0-0-0`) + Datos Promocionales (`0-1-0`)**, la extracción de la **fecha de corte (`plan-details-row-template-col-2-0-0`)**, la revocación segura de la sesión SSO (`dev.smapps.mx:9000/sso/revoke`) y el respaldo en caché JSON local.

Alternativa Basada en JSX: ScriptWidget (`everettjf/ScriptWidget`)

Para desarrolladores acostumbrados a React que prefieren escribir componentes declarativos en JSX en lugar de usar la API imperativa `ListWidget` de Scriptable, el proyecto de código abierto ScriptWidget (`https://github.com/everettjf/ScriptWidget`) ofrece un entorno híbrido nativo para iOS y macOS. ScriptWidget incluye ScriptWidget Studio para Mac (con editor CodeMirror, consola de diagnóstico, laboratorio de peticiones para conectores de APIs de terceros y vista previa multitamaño) y traduce árboles JSX invocados mediante `$render(...)` directamente a vistas nativas de SwiftUI, soportando un manifiesto `widget.json` con lista blanca de dominios de red permitidos.

Ruta de Implementación 2: Desarrollo Nativo en Xcode (Swift, SwiftUI y WidgetKit)

El desarrollo de una aplicación nativa desde la MacBook Pro M3 utilizando Xcode, SwiftUI y el framework `WidgetKit` proporciona acceso directo a las capacidades de iOS 17 y versiones posteriores, tales como botones interactivos respaldados por `AppIntents` que permiten forzar la recarga del saldo tocando el cronómetro del widget sin abrir la aplicación contenedora.

Restricciones Críticas de Aprovisionamiento: Cuenta Gratuita vs. Programa de Desarrollador (\$99 USD)

Antes de estructurar el proyecto en Xcode, es indispensable considerar una limitación técnica de las cuentas gratuitas de Apple (*Personal Team*) que afecta directamente a las extensiones de widgets en iOS.

En el desarrollo estándar de iOS, el usuario inicia sesión en la aplicación principal y el token o resultado se comparte con la extensión del widget a través de un contenedor compartido (`UserDefaults(suiteName: "group.com.usuario.telcel")`). Sin embargo, aunque las cuentas gratuitas soportan `App Groups` en compilaciones para macOS, los perfiles de aprovisionamiento generados por un *Personal Team* gratuito en iOS bloquean el *entitlement* `App Groups`, deteniendo la compilación con el error `Provisioning profile "..." doesn't include the App Groups entitlement`.

Para evitar el pago de \$99 USD anuales del *Apple Developer Program*, toda la lógica de red (`URLSession`) y el almacenamiento de caché (`FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)`) deben residir directamente dentro del target del `Widget Extension`. Las credenciales pueden inyectarse como constantes de compilación privadas o configurarse directamente desde la pantalla de edición del widget utilizando `AppIntentConfiguration` y `WidgetConfigurationIntent`.

Por otra parte, los certificados firmados con una cuenta gratuita expiran cada 7 días, imponiendo además una cuota máxima de 3 aplicaciones instaladas simultáneamente por dispositivo y 10 App IDs registrados por semana. Para evitar conectar el iPhone físicamente por cable USB a la MacBook Pro cada semana cuando el perfil caduca, el desarrollador puede instalar AltServer en la MacBook Pro M3 junto con AltStore o SideStore en el iPhone, lo que permite refrescar la firma criptográfica del archivo `.ipa` automáticamente a través de la red Wi-Fi local sin pérdida de datos.

Estructura del Proyecto Xcode (`MiTelcelWidget.xcodeproj`)

El código nativo en Swift y SwiftUI se encuentra extraído y organizado como proyecto de Xcode listo para compilar en la raíz del repositorio:

- **Proyecto Xcode:** [`MiTelcelWidget.xcodeproj`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/MiTelcelWidget.xcodeproj/project.pbxproj) (configurado con los targets `MiTelcelApp` y `MiTelcelWidgetExtension` para iOS 17.0+, sin requerir *App Groups* para compatibilidad con cuentas gratuitas *Personal Team*).
- **Cliente de Red, Modelo y Parser Wave B2F:** [`MiTelcelWidget/TelcelNetworkService.swift`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/MiTelcelWidget/TelcelNetworkService.swift) (`TelcelUsageEntry`, `TelcelBucketUsage` y `TelcelNetworkService` con autenticación SSO, intercambio JWT `token:b2f`, suma de bolsas `0-0-0` + `0-1-0`, extracción de fecha de corte `plan-details-row-template-col-2-0-0` y revocación automática de sesión).
- **Extensión WidgetKit y Vista SwiftUI:** [`MiTelcelWidget/MiTelcelWidget.swift`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/MiTelcelWidget/MiTelcelWidget.swift) (`RefreshTelcelUsageIntent`, `MiTelcelTimelineProvider`, `MiTelcelWidgetView` y `@main struct MiTelcelUsageWidget`) junto con [`MiTelcelWidget/Info.plist`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/MiTelcelWidget/Info.plist).
- **Aplicación Contenedora iOS:** [`MiTelcelApp/MiTelcelApp.swift`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/MiTelcelApp/MiTelcelApp.swift) (vista previa en vivo del widget y desglose individual de cada bolsa de datos del plan y promoción).

Arquitectura Híbrida de Respaldo: Proxy Headless o Automatización por SMS

Si en futuras actualizaciones Telcel impone un desafío CAPTCHA o verificación de dos factores (2FA por SMS) en el endpoint web `/mitelcel/login/auth` que impida el inicio de sesión directo desde un cliente HTTP ligero, existen dos patrones de ingeniería de respaldo altamente efectivos que desacoplan la extracción de datos de las limitaciones del entorno de ejecución del widget.

El primer patrón consiste en desplegar un microservicio proxy con sesión persistente en macOS o en la nube. En lugar de ejecutar el inicio de sesión desde las limitadas ventanas de memoria y tiempo de ejecución de una extensión de iOS, un servicio ligero en Node.js o Python alojado en la MacBook Pro M3 o en un contenedor privado mantiene una sesión autenticada de larga duración contra `mitelcel.com` o `m.mitelcel.com`, resuelve cualquier validación de navegador con encabezados completos y expone un endpoint JSON preprocesado que el script de Scriptable o el `TimelineProvider` de SwiftUI consume en milisegundos.

El segundo patrón aprovecha la infraestructura de mensajería celular sin conexión a Internet mediante la automatización de consultas SMS al número corto `333`. Telcel mantiene activo de forma gratuita e ilimitada un servicio que responde con el desglose de saldo y datos al enviar la palabra `Saldo` por mensaje de texto al `333`, además del menú USSD `*133#` y el sistema de voz `*321`. En iOS, una automatización personal dentro de la aplicación nativa Atajos (Shortcuts) configurada para activarse al recibir un mensaje del remitente `333` puede extraer mediante expresiones regulares los megabytes disponibles del cuerpo del SMS, escribir el resultado directamente en el archivo `mitelcel_usage_cache.json` dentro del directorio de Scriptable en iCloud Drive y refrescar el widget instantáneamente sin haber realizado una sola petición HTTP.

Síntesis de Despliegue para el Entorno MacBook Pro M3

La evaluación integral de las herramientas disponibles demuestra que, para una puesta en marcha inmediata y libre de mantenimiento periódico, la implementación sobre Scriptable utilizando el código JavaScript provisto constituye la solución técnica superior. Este enfoque permite replicar con exactitud la tarjeta oscura de `22.40 GB` mostrada en la imagen de referencia en cuestión de minutos, editando el archivo `.js` directamente desde un editor de código en la MacBook Pro M3 a través de la carpeta sincronizada de iCloud Drive, al tiempo que evita tanto la caducidad cada 7 días de los perfiles de aprovisionamiento como el bloqueo del contenedor compartido `App Groups` en cuentas gratuitas de Xcode.

En caso de que el esquema JSON devuelto por el endpoint `/mitelcel/mitelcel-api-web/api/postpago/internet/consumo/` presente variaciones en los nombres de las propiedades según la modalidad específica del contrato —como sucede con los nuevos *Planes Ultra Ilimitados Libres de Plan Forzoso* incorporados a partir de la versión 14.4.40 de Mi Telcel—, el flujo de trabajo óptimo consiste en activar el modo de datos simulados (`useMockData: true`) para validar inicialmente el ajuste tipográfico en el iPhone y, posteriormente, ejecutar una captura rápida con `mitmproxy` desde la MacBook Pro M3 al abrir la aplicación Mi Telcel v15.1.1 para mapear las llaves exactas del objeto JSON dentro de la función de normalización del widget.

Sources used in the report  
SimpMusic 2.0.0 (arm64-v8a) \- By maxrave-dev \- APKMirror

Panoptes: Detecting Out-of-Sight Privacy Exposure in Android

Scriptable scripts for iOS \- GitHub

iOS Scriptable News Widget (WordPress & RSS) \- GitHub

ScriptWidget is an iOS/macOS app that we can create widgets for

Yii2 Mitelcel client TEST \- GitHub Gist

Is it postquantum?

Analyzing Prominent Mobile Apps in Latin America \- Jeffrey Knockel

Análisis de aplicaciones de telecomunicaciones | Datávoros

José Carlos Zúñiga Espinoza: CV

shaznishiraz/slt-data-remaining-widget-ios: Scriptable X ... \- GitHub

GitHub \- Enhed/clawd-usage-winwidget: Claude usage limits in a

iOS 14 Widget for Scriptable app \- Telekom Data Usage \- GitHub Gist

Bot para Iniciar Sesion en un Formulario Web \- Jonathan Melgoza

Como crear un contador de dias que faltan en Javascript \- AulaScript

iOS 14: Neues Widget für den Telekom-Datenverbrauch \- mobiFlip

iPhone-Widgets zeigen Datenvolumen und Webinhalte

Code development workflow \- Scriptable \- Automators Talk

telekom.js · GitHub

telekom.js · GitHub

\[German\] Small widget for Telekom mobile data usage : r/Scriptable

HTTP pass.telekom.de \- Bindings \- openHAB Community

Analyzing Prominent Apps in Latin America \- Open Tech Fund

Mi Telcel \- Apps en Google Play

Iniciar sesión \- Mi Telcel Empresas

Mitelcel.com

Paquetes Amigo Sin Límite

Autofill Fails to Fill Fields on mitelcel.com \- 1Password Community

Consumo de Internet \- App Store \- Apple

A small collection of my Scriptable iOS widgets. \- GitHub

Widget Examples \- Page 14 \- Scriptable \- Automators Talk

Scriptable Widget Progress Tracker | PDF \- Scribd

Guys help me out with this on my iPhone 15 Pro Max

¿Mi saldo Telcel? Consulta fácil, recarga al instante y sigue conectado

Mi Telcel \- App Store

Mi Telcel descarga gratis \- speedymovil.wire \- Droidinformer.org

Cómo Consultar tu Saldo Telcel Amigo | Guía Fácil y Rápida

Avisos \- Código de Prácticas Comerciales Telcel

Creating News Widget with WidgetKit: A Step-by-Step Guide

Sideloading \- Provenance EMU

How iOS Sideloading Actually Works in 2025: Dev Certs, AltStore

How to Install Apps on iPhone Without App Store \- TMS Outsource

iOS Pentesting withuot Jailbreak \- HackTricks

Create an Interactive Widget Using App Intents \- Swiftjective-C

Creating an interactive widget with SwiftUI \- Create with Swift

WidgetKit: Build Interactive Widgets for iOS 17 | by Chandra Welim

SwiftUI: Add Controls (Interactivity) to Widgets \- Level Up Coding

Play with iOS Widgets. Background | by Bo Liu | Axel Springer Tech

Building widgets with WidgetKit and SwiftUI \- Tanaschita.com

Signing With a Free Personal Team | zudo-tauri-wisdom

Sources read but not used  
Collection of widgets and scripts made using scriptable app for iOS

Scriptable iOS Widgets: Home

ios-widget · GitHub Topics

Scripts and widgets for the iOS Scriptable App \- GitHub

Scriptable Widget Collection Website \- Reddit

Widget Collection \- Scriptable iOS Widgets

Sites using EV in the Top 1 Million \- 13th Sep 2019 \- GitHub Gist

Automated Malware Analysis Report for U83lY9pZJb \- Joe Sandbox

danVega.js @danvegajs \- Twitter Profile | TwStalker

3rd party hidden app found in Nokia smartphones

Single Sign-On | LastPass Business

Factura Gorila, guarda passwords en texto plano \=X : r/mexico \- Reddit

Hosts in the Alexa Top 30k vulnerable to CVE-2016 ... \- Discover gists

gogl92's gists · GitHub \- GitHub Gist

Mi Telcel 9.9 (Android 5.0+) \- APKMirror

Phone API \- Mitelcel | SEON. Fraud Fighters

An Analysis of Essential Latin American Mobile Apps | OTF

Límites, cuotas y restricciones de suscripción y servicio de Azure

FLABDUL/giffgaff-usage-analyzer: Analyze your giffgaff ... \- GitHub

Userscripts \- App Store \- Apple

internet-usage-monitor/install.sh at main · YahyaZekry ... \- GitHub

Bun — A fast all-in-one JavaScript runtime

No puedo acceder a un archivo creado con google apps script

Cómo comparar dos carpetas y encontrar los archivos que faltan

Telekom: Dieses Widget zeigt den Datenverbrauch an \- Computer Bild

Sillium's gists · GitHub

Best Workflow to develop/create/debug Scripts : r/Scriptable \- Reddit

telekom.de-fixed.txt \- GitHub Gist

Telekom Progress Widget : r/Scriptable \- Reddit

README.md · GitHub

Widget: Deutsche Telekom data usage : r/Scriptable \- Reddit

How: automatic pull of data & save data locally \- Automators Talk

Widget Examples \- Page 24 \- Scriptable \- Automators Talk

Mi Telcel Empresas: Iniciar sesión

https\://gist.github.com/Sillium/f904fb89444bc8dde12cfc07b8fa8728

\+ 5GB mit LEOVA6 : r/fraenkfriends \- Reddit

r/fraenkfriends \- 5GB extra mit THOP1 \- Reddit

\+ 5GB mit LEOVA6 : r/fraenkfriends \- Reddit

\+ 5GB mit CORVA4 : r/fraenkfriends \- Reddit

\+ 5GB mit LEOVA6 : r/fraenkfriends \- Reddit

Telekom Progress Widget : r/Scriptable \- Reddit

Pa \- BERYHUERT

Contrato de Prestación de Servicios Telcel | Políticas y códigos

¿por qué la página y app de Telcel son tan malos y nunca funcionan

Glosario \- Atención a clientes \- Telcel

Mi Claro PR \- App Store

Mi Claro PR \- App Store

https\://github.com/marcjulianschwarz/telekom-data-usage-widget

https\://gitlab.com/sillium-scriptable-projects/universal-scriptable-widget-libraries

Marc Julian Schwarz (marcjulianschwarz) \- GitHub

Scriptable Widget Variables Guide | PDF \- Scribd

Circular Progress Bar Function For Widgets : r/Scriptable \- Reddit

Improved Blue Archive AP & Cafe Check Widget (iOS Shortcuts x

Con Mi Telcel, administra tu línea desde donde estés

Internet Compartido, así es como Telcel quiere que ... \- Xataka México

Aviso de Privacidad \- Mi Telcel Empresas

Mi Telcel \- Apps on Google Play

Todo lo que tienes saber sobre el saldo Telcel. \- LuisGyG

Revisar saldo del celular en internet gratis con Mi Telcel \- iGeek

Telcel "Checking your Balance" \- Mexico General \- Chapala

That is not true. To sideload an app a free Apple Developer is

Install Apps on Non-Jailbroken Devices with Sideloadly

how to create a free developer account \- Apple Developer

\[News\] Free developer account installs reduced to 7 days \- Reddit

Sideloading your own iOS app without paying Apple \$99/year

\[QUESTION\] regarding 7 day limit and Apple developer account

Security \- shaznishiraz/slt-data-remaining-widget-ios \- GitHub

Issues · shaznishiraz/slt-data-remaining-widget-ios \- GitHub

WidgetKit iOS 17-26: Interactive Widgets with App Intents \- SharpSkill

Developing iOS & Android Home Screen Widgets in Flutter

A widget using Button(intent:) { }… | Apple Developer Forums

Should you pay for the Apple Developer Program? \- Flavio Copes

Thoughts 