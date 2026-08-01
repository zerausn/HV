# HV — Bot de Postulación a Empleo

Automatiza la aplicación a ofertas de empleo en [Computrabajo Colombia](https://co.computrabajo.com) usando **Playwright** + **Microsoft Edge** con tu perfil real (conserva tu sesión iniciada).

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
    "delay_min_ms": 1500,
    "delay_max_ms": 3500
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

## Estructura

```
computrabajo-bot/
├── index.js              # Orquestador principal: menú, sesión, loop de postulaciones
├── config.json           # Perfil del candidato y configuración del bot
├── preguntas.json        # Caché de respuestas a preguntas de formularios
├── aplicadas.json        # Historial de URLs ya postuladas (evita duplicados)
├── ultima_sesion.json    # URLs de la última sesión (para continuar donde quedó)
├── package.json
├── src/
│   ├── computrabajo.js   # Lógica DOM específica de Computrabajo (navegar, clicar Aplicar)
│   ├── formFiller.js     # Análisis y relleno de formularios de postulación
│   ├── browser.js        # Inicialización de Playwright + Edge con perfil real
│   └── preguntas.js      # Motor de caché: leer, guardar y buscar respuestas
└── logs/
    └── YYYY-MM-DD.log    # Log diario de postulaciones
```

## Notas técnicas

- El botón "Aplicar" de Computrabajo es un `<span>` con atributo `[attach-cv-button-text]`, no un `<button>` estándar. El bot lo detecta con selectores específicos.
- El bot usa `launchPersistentContext` de Playwright para reutilizar el perfil de Edge.
- Cada respuesta en formulario espera entre **4 y 7 segundos** para parecer humano.
- En modo `headless: false` puedes ver todo lo que hace el bot en tiempo real.
