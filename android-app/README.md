# Mi Bait Widget — app nativa para Android

App Android (Kotlin, Jetpack Compose + Glance) con un widget de pantalla de inicio que muestra el consumo de datos de una línea **Bait**: datos libres, vigencia con semáforo de días, medidor semicircular gastado/disponible y presupuesto diario. Mismo diseño que el widget Small de iOS (`src/MiBaitWidget.js`).

> [!NOTE]
> Bait no requiere contraseña: la app solo pide tu número a 10 dígitos y consulta `GET https://mibait.com/api/core/q/dn/{numero}/get/consumption` con la llave pública `x-ord-service` (descubierta en `mibait.com`, con respaldo local).

## Instalación

1. Descarga `MiBaitWidget.apk`:
   - **Versión publicada:** sección *Releases* del repositorio.
   - **Última compilación:** pestaña *Actions* › workflow **Android Bait** › ejecución más reciente › artefacto `MiBaitWidget-apk` (viene en un `.zip`; descomprímelo).
2. Abre el APK en tu teléfono. Android pedirá permitir "Instalar apps desconocidas" para tu navegador o administrador de archivos.
3. Abre **Mi Bait Widget**, escribe tu número y toca **Validar y guardar**. La app comprueba el número contra Bait antes de guardarlo.
4. Toca **Agregar widget a la pantalla de inicio** (o mantén presionado un espacio vacío › Widgets › Mi Bait Widget).

**Actualizaciones automáticas (opcional):** con [Obtainium](https://github.com/ImranR98/Obtainium) agrega la URL del repositorio y te avisará de cada release nuevo.

## Uso

- El widget se actualiza **cada hora** (WorkManager, solo con red) y **al tocarlo**.
- Si una actualización falla se muestra el último dato con `☁️`; los días restantes se recalculan cada día a partir de la vigencia guardada.
- Para cambiar de línea: abre la app › **Cambiar o borrar número**.

## Privacidad

- El número se guarda **cifrado (AES-256-GCM) con una llave del Android Keystore** que nunca sale del teléfono (equivalente al Keychain de iOS).
- Los datos de la app se excluyen de respaldos en la nube y de transferencias entre dispositivos.
- La app solo se conecta a `mibait.com`.

## Estructura

| Ruta | Contenido |
| :--- | :--- |
| `core/` | Kotlin puro (sin Android): `BaitParser` (port 1:1 de `parseBaitResponse`), `BaitClient` (descubrimiento de `x-ord-service` + consulta), `WidgetLabels` (textos del widget) y pruebas JUnit. |
| `app/` | `MainActivity` (configuración), `PhoneStore` (Keystore), `UsageCache`, `RefreshWorker` y el widget Glance (`BaitWidget`, `GaugeRenderer`). |
| `../tests/fixtures/bait/` | Respuestas de ejemplo con el resultado esperado. Las validan **tanto** `BaitParserTest` (Kotlin) **como** `tests/test_parser.mjs` (JS), así ambos parsers no pueden divergir. |
| `scripts/emulator_smoke_test.sh` | Prueba de humo que CI ejecuta en un emulador (instala, abre la app, revisa crashes y que el widget esté registrado). |

## Desarrollo

```sh
cd android-app
./gradlew -PcoreOnly :core:test     # pruebas del parser; no requiere Android SDK
./gradlew :app:assembleRelease      # APK (requiere Android SDK / Android Studio)
```

Al cambiar el parser de Bait en JS o Kotlin, agrega o actualiza un fixture en `tests/fixtures/bait/` y corre ambas suites.

## CI y firma

El workflow [`.github/workflows/android-bait.yml`](../.github/workflows/android-bait.yml) corre las pruebas, compila el APK, hace la prueba de humo en un emulador (API 34) y, al publicar un *Release*, adjunta `MiBaitWidget.apk`.

Sin configuración extra el APK se firma con la llave debug del runner, que **cambia entre ejecuciones**: para instalar una compilación nueva encima de otra tendrías que desinstalar primero. Para firmar siempre con la misma llave, crea una una sola vez en tu computadora:

```sh
keytool -genkeypair -v -keystore mibait-release.jks -alias mibait -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 mibait-release.jks   # en macOS: base64 -i mibait-release.jks
```

y agrega en *Settings › Secrets and variables › Actions* los secrets `BAIT_KEYSTORE_BASE64`, `BAIT_KEYSTORE_PASSWORD`, `BAIT_KEY_ALIAS` (`mibait`) y `BAIT_KEY_PASSWORD`. Guarda el `.jks` en un lugar seguro y nunca lo subas al repositorio.
