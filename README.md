# HV — Bot de Postulación a Empleo (Computrabajo)

Automatiza la aplicación a ofertas de empleo en [Computrabajo Colombia](https://co.computrabajo.com) usando **Playwright** + **Microsoft Edge** con tu perfil real (conserva tu sesión iniciada y cookies).

> ⚠️ **Privacidad**: `config.json`, `preguntas.json`, `aplicadas.json`, `ultima_sesion.json` y `bloque_original.txt` contienen datos personales (cédula, email, teléfono, respuestas de formularios) y están **excluidos del repositorio** vía `.gitignore`. Solo se publica el código y la documentación.

## ¿Qué hace exactamente?

1. Lee una lista de URLs de ofertas que pegues en la terminal (modo interactivo).
2. Abre Microsoft Edge con tu perfil real (conserva cookies y sesión de Computrabajo).
3. Por cada oferta:
   - Navega a la URL.
   - Detecta y hace clic en el botón azul **"Aplicar"** (incluso si es un `<span>` no estándar).
   - Analiza el formulario de postulación campo a campo.
   - Rellena automáticamente los datos básicos del perfil (nombre, celular, email, ciudad).
   - Para preguntas nuevas: te pregunta en la terminal y **guarda tu respuesta** en `preguntas.json` para usarla automáticamente en el futuro.
   - Registra cada postulación exitosa en `aplicadas.json` (nunca repite la misma oferta).
4. Guarda la sesión de URLs en `ultima_sesion.json` para poder continuarla luego.

## Requisitos

- Node.js >= 18
- Playwright: `npm install`
- Microsoft Edge instalado (Flatpak `com.microsoft.Edge` en Linux)
- Sesión iniciada en Computrabajo dentro de Edge

## Instalación

```bash
npm install
```

## Uso

```bash
node index.js
```

El bot te presentará un menú interactivo:

```
1) Continuar con las URLs de la sesión anterior
2) Ingresar nuevas URLs
3) Combinar (sesión anterior + nuevas)
```

Al elegir **2 o 3**, pegás el bloque de URLs (una por línea) y escribís `FIN` para empezar.

### Ejecución con entrada por FIFO (sin terminal interactiva)

Para responder las preguntas desde otro proceso (p. ej. un agente de IA):

```bash
rm -f /tmp/hv_fifo /tmp/hv_bot.log
mkfifo /tmp/hv_fifo
setsid bash -c '(sleep 7200) > /tmp/hv_fifo & nohup node index.js < /tmp/hv_fifo > /tmp/hv_bot.log 2>&1 &'
```

Responder una pregunta pendiente:

```bash
printf 'Si\n' > /tmp/hv_fifo
```

> ⚠️ El FIFO se desincroniza si se envían respuestas antes de que aparezca la pregunta: verificar siempre el log antes de responder. Al finalizar, el bot queda esperando "Presiona Enter para cerrar Edge...", que es poco confiable por FIFO: matar con `kill -9 <pid>` y cerrar Edge.

## Configuración (`config.json`)

```json
{
  "perfil": {
    "nombre": "Tu Nombre Completo",
    "email": "tu@email.com",
    "telefono": "3001234567",
    "ciudad": "Cali",
    "cv_pdf": "/ruta/a/tu/cv.pdf",
    "salario_minimo": 2000000,
    "experiencia_anios": 3,
    "modalidades": ["presencial", "remoto", "híbrido"]
  },
  "busqueda": {
    "cargo": "analista",
    "ciudad": "cali",
    "delay_min_ms": 4000,
    "delay_max_ms": 7000
  },
  "plataformas": {
    "computrabajo": true
  },
  "edge": {
    "path": "/ruta/al/binario/msedge",
    "profile_dir": "/ruta/al/perfil/de/edge"
  }
}
```

## Caché de respuestas (`preguntas.json`)

Cuando el bot encuentra una pregunta que no puede responder automáticamente con el perfil, te pregunta en la terminal. Tu respuesta queda guardada para siempre en `preguntas.json`. La próxima vez que cualquier empresa haga una pregunta similar, el bot la responde solo.

Puedes editar este archivo manualmente para corregir respuestas guardadas.

## Detección de bloqueo / oferta no disponible

- **Bloqueo de sitio**: si la página devuelve "service is unavailable" / 503, el bot espera 60 segundos, captura `1b_bloqueo_temporal` y reintenta una vez.
- **Oferta no disponible**: si el botón "Aplicar" no aparece, captura `2c_oferta_no_disponible` y sigue con la siguiente URL.

## Ritmo humano (anti-detección)

Los delays configurados (ver `config.json`) se aplican entre navegaciones, clics y campos:

- Navegación entre ofertas: **4-7 segundos**
- Entre campos de un formulario: **1.5-3 segundos**
- Sin saltos de página: el bot usa `launchPersistentContext` de Playwright, así que tu perfil de Edge real y su sesión se conservan (mismo fingerprint).

## Estructura

```
computrabajo-bot/
├── index.js              # Orquestador principal: menú, sesión, loop de postulaciones
├── config.json           # Perfil del candidato y configuración del bot (NO subido)
├── preguntas.json        # Caché de respuestas a preguntas de formularios (NO subido)
├── aplicadas.json        # Historial de URLs ya postuladas (NO subido)
├── ultima_sesion.json    # URLs de la última sesión (NO subido)
├── bloque_original.txt   # Bloque original de URLs de ofertas (NO subido)
├── package.json
├── src/
│   ├── computrabajo.js   # Lógica DOM específica de Computrabajo (navegar, clicar Aplicar)
│   ├── formFiller.js     # Análisis y relleno de formularios de postulación
│   ├── browser.js        # Inicialización de Playwright + Edge con perfil real
│   ├── preguntas.js      # Motor de caché: leer, guardar y buscar respuestas
│   └── screenshots.js    # Capturas de pantalla por paso (carpeta screenshots/)
└── logs/
    └── YYYY-MM-DD.log    # Log diario de postulaciones (NO subido)
```

## Notas técnicas

- El botón "Aplicar" de Computrabajo es un `<span>` con atributo `[attach-cv-button-text]`, no un `<button>` estándar. El bot lo detecta con selectores específicos.
- El bot usa `launchPersistentContext` de Playwright para reutilizar el perfil de Edge.
- **Grupos de radios** (`procesarRadioGroup`): el label se extrae del ancestro común del grupo restando los textos de las opciones (antes se subía hasta el contenedor y devolvía "Ver oferta completa" para todo, generando un bucle). El clic se hace con `input.check({force: true})` por índice de opción, que es compatible con el DOM real de Computrabajo.
- Las URLs de búsqueda siguen el formato real (verificado 2026-08): `https://co.computrabajo.com/empleos-de-<cargo>-en-<ciudad>`.
- En modo `headless: false` puedes ver todo lo que hace el bot en tiempo real.
- Screenshots por paso en `screenshots/YYYY-MM-DD/` (no versionados en git).
