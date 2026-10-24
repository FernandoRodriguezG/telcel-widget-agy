# Mi Bait Widget — app nativa para Android

App Android (Kotlin, Jetpack Compose + Glance) con un widget de pantalla de inicio que muestra el consumo de datos de una línea **Bait**: datos libres, vigencia con semáforo de días, medidor semicircular gastado/disponible y presupuesto diario. Mismo diseño que el widget Small de iOS (`src/MiBaitWidget.js`).

> [!NOTE]
> Bait no requiere contraseña: la app solo pide tu número a 10 dígitos y consulta `GET https://mibait.com/api/core/q/dn/{numero}/get/consumption` con la llave pública `x-ord-service` (descubierta en `mibait.com`, con respaldo local).

## Instalación

1. En el teléfono, abre [Releases](https://github.com/FernandoRodriguezG/telcel-widget-agy/releases/latest) y descarga `MiBaitWidget.apk` (sección *Assets*).
2. Abre el APK. Android pedirá permitir "Instalar apps desconocidas" para tu navegador o administrador de archivos.
3. Abre **Mi Bait Widget**, escribe tu número y toca **Validar y guardar**. La app comprueba el número contra Bait antes de guardarlo.
4. Toca **Agregar widget a la pantalla de inicio** (o mantén presionado un espacio vacío › Widgets › Mi Bait Widget).

### Actualizaciones con Obtainium (recomendado)

[Obtainium](https://github.com/ImranR98/Obtainium) revisa los Releases y avisa cuando hay versión nueva:

1. Instala Obtainium desde su página de Releases.
2. *Add App* › pega `https://github.com/FernandoRodriguezG/telcel-widget-agy`.
3. En *Filter release titles by regular expression* escribe `^Mi Bait` (el repo también podría tener releases de otras cosas).
4. *Add*. Si ya tenías la app instalada desde un Release, Obtainium la reconoce y solo instala las actualizaciones.

Las actualizaciones se instalan encima sin perder tu número, siempre que vengan de un Release (todos se firman con la misma llave).

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

## CI y releases

El workflow [`.github/workflows/android-bait.yml`](../.github/workflows/android-bait.yml) corre las pruebas, compila el APK y hace la prueba de humo en un emulador (API 34) en cada push. Al **publicar un Release** además adjunta `MiBaitWidget.apk` firmado con la llave del proyecto.

### Configuración inicial (una sola vez): llave de firma

Android solo instala una versión encima de otra si ambas están firmadas con la misma llave. Los APK de *Actions* sin esta llave se firman con una llave debug que cambia en cada ejecución; por eso los Releases **exigen** la llave y fallan sin ella.

1. Genera la llave en una computadora con Java (o en Termux con `pkg install openjdk-21`):
   ```sh
   keytool -genkeypair -v -keystore mibait-release.jks -alias mibait -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 mibait-release.jks > mibait-release.b64   # en macOS: base64 -i mibait-release.jks -o mibait-release.b64
   ```
2. En GitHub: *Settings › Secrets and variables › Actions › New repository secret*, crea:
   | Secret | Valor |
   | :--- | :--- |
   | `BAIT_KEYSTORE_BASE64` | Contenido completo de `mibait-release.b64` |
   | `BAIT_KEYSTORE_PASSWORD` | Contraseña del keystore |
   | `BAIT_KEY_ALIAS` | `mibait` |
   | `BAIT_KEY_PASSWORD` | Contraseña de la llave (la misma si no pusiste otra) |
3. Respalda `mibait-release.jks` y sus contraseñas en un lugar seguro (gestor de contraseñas). **Si la pierdes, nadie podrá actualizar la app sin desinstalarla.** Nunca la subas al repositorio y borra el `.b64` después.

### Publicar una versión

1. Integra los cambios en `master`.
2. *Releases › Draft a new release*:
   - **Tag:** `android-vX.Y.Z` (por ejemplo `android-v0.1.0`), creado sobre `master`. Sube el número en cada versión.
   - **Título:** `Mi Bait X.Y.Z`.
   - **Notas:** qué cambió, en una o dos líneas.
3. *Publish release*. En ~6 minutos CI compila, prueba y adjunta `MiBaitWidget.apk`; Obtainium lo detecta solo.

`versionName` sale del tag y `versionCode` del número de ejecución de CI, así que siempre aumenta.
