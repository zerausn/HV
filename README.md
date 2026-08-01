# HV - Bot de postulación a Computrabajo

Automatiza la aplicación a ofertas de empleo de [Computrabajo Colombia](https://co.computrabajo.com) usando **Playwright** + **Microsoft Edge** con tu perfil real (conserva tu sesión iniciada).

## Cómo funciona

1. Abre Microsoft Edge usando tu perfil real (`~/.var/app/com.microsoft.Edge/config/microsoft-edge`), por lo que conserva tus cookies y sesión de Computrabajo.
2. Navega a la oferta de trabajo.
3. Acepta las cookies.
4. Hace click en **"Aplicar"**.
5. Si pide login, espera a que lo hagas manualmente en la ventana (presionas Enter en la terminal cuando termines).
6. Continúa con el flujo de postulación.

## Requisitos

- Node.js >= 18
- Playwright: `npm install`
- Microsoft Edge instalado (en este sistema: Flatpak `com.microsoft.Edge`)
- Sesión iniciada en Computrabajo (en Edge)

## Instalación

```bash
npm install
```

## Uso

```bash
node index.js
```

Durante la ejecución:
- Se cierra Edge si está abierto (para poder usar el perfil).
- El script te pide presionar Enter en la terminal cuando hayas terminado de loguearte manualmente en la ventana de Edge.

## Configuración

Edita las constantes al inicio de `index.js`:

| Constante | Descripción |
|---|---|
| `EDGE_PATH` | Ruta del binario de Edge (ajustar si tu instalación es distinta). |
| `PROFILE_DIR` | Directorio del perfil de Edge con tu sesión guardada. |
| `url` | URL de la oferta de trabajo a la que aplicar. |

## Flujo actual

- [x] Abrir Edge con perfil real (sesión persistente)
- [x] Navegar a la oferta
- [x] Aceptar cookies
- [x] Click en "Aplicar"
- [x] Esperar login manual
- [ ] Llenar formulario de postulación (en desarrollo)
- [ ] Subir hoja de vida
- [ ] Enviar postulación

## Notas

- El bot usa `launchPersistentContext` de Playwright para reutilizar el perfil de Edge.
- Si Edge está corriendo, el bot lo cierra con `pkill -f msedge` antes de iniciar.
- En modo `headless: false` ves todo lo que hace el bot.

## Estructura

```
HV/
├── index.js        # Bot principal
├── package.json    # Dependencias (Playwright)
└── .gitignore
```
