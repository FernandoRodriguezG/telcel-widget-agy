# Mi Telcel iOS Widget (WidgetKit & Scriptable)

Widget para iOS que muestra en tiempo real los **GB disponibles combinados (Plan Base + Datos Promocionales)**, el **consumo acumulado**, los **días restantes** y la **siguiente fecha de corte/vigencia** de tu línea Mi Telcel utilizando la arquitectura 2026 de microservicios (**WebLogin SSO + JWT + Wave B2F**).

---

## Estructura del Repositorio

```text
.
├── MiTelcelWidget.xcodeproj/       # Proyecto nativo de Xcode (iOS 17+)
├── MiTelcelApp/
│   └── MiTelcelApp.swift           # App contenedora iOS (vista previa y desglose por bolsa)
├── MiTelcelWidget/
│   ├── TelcelNetworkService.swift  # Cliente SSO + JWT + Parser Wave B2F (Plan + Promo + Vigencia)
│   ├── MiTelcelWidget.swift        # Extensión WidgetKit, TimelineProvider, AppIntent y Vista SwiftUI
│   └── Info.plist                  # Configuración de extensión WidgetKit
├── src/
│   └── MiTelcelWidget.js           # Implementación alternativa lista para Scriptable (iOS)
├── .agents/skills/telcel-api-probe/
│   ├── SKILL.md                    # Skill para validación automatizada de endpoints
│   └── scripts/probe_telcel.sh     # Script CLI de prueba y extracción de esquema JSON
├── Telcel Widget API.md            # Especificación técnica del API de Telcel para el widget
├── API Validation.md               # Guía de validación manual con curl y jq
└── Research.md                     # Investigación de arquitectura y diseño del widget
```

---

## Opción 1: Compilación Nativa en Xcode (`WidgetKit` / SwiftUI)

1. Abre `MiTelcelWidget.xcodeproj` en **Xcode 15+ / 16+**.
2. Edita tus credenciales (`phone` y `password`) en [`MiTelcelWidget/TelcelNetworkService.swift`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/MiTelcelWidget/TelcelNetworkService.swift).
3. En la pestaña **Signing & Capabilities** de los targets `MiTelcelApp` y `MiTelcelWidgetExtension`, selecciona tu equipo (*Personal Team* o *Apple Developer Program*) y ajusta el `Bundle Identifier` si es necesario.
4. Compila y ejecuta el esquema `MiTelcelApp` en tu iPhone o Simulador (`Cmd + R`).

---

## Opción 2: Uso en Scriptable (Sin Xcode)

1. Copia el contenido de [`src/MiTelcelWidget.js`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/src/MiTelcelWidget.js) dentro de un nuevo script en la app **Scriptable** para iOS.
2. Configura `CONFIG.phone` y `CONFIG.password` en las primeras líneas del script.
3. Añade un widget de Scriptable de tamaño pequeño (*Small*) en la pantalla de inicio de tu iPhone y selecciona el script.

---

## Validación de Endpoints desde Terminal (macOS)

1. Copia `.env.example` a `.env` y coloca tu número a 10 dígitos y contraseña:
   ```zsh
   cp .env.example .env
   ```
2. Ejecuta el probe automatizado (autentica vía SSO, consulta bolsas `0-0-0` + `0-1-0` y revoca la sesión al terminar):
   ```zsh
   zsh .agents/skills/telcel-api-probe/scripts/probe_telcel.sh
   ```
3. Consulta el reporte en `artifacts/probe_report.txt` y la especificación detallada en [`Telcel Widget API.md`](file:///Users/armandomaynez/Code/Repos/telcel-widget-agy/Telcel%20Widget%20API.md).
