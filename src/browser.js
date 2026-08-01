/**
 * browser.js — Gestión del navegador Edge con perfil real
 *
 * Abre Edge Flatpak usando el perfil del usuario (sesión, cookies, historial).
 * Esto es clave: al usar el perfil real, Computrabajo ya tiene la sesión
 * iniciada y el fingerprint del navegador parece un usuario humano normal.
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

/**
 * Cierra Edge si está corriendo para liberar el perfil (Playwright necesita
 * acceso exclusivo al directorio de perfil).
 */
export function cerrarEdge() {
  try {
    execSync('pkill -f msedge 2>/dev/null || true');
    return new Promise(r => setTimeout(r, 2000));
  } catch {
    return Promise.resolve();
  }
}

/**
 * Abre Edge con el perfil persistente del usuario.
 * @param {object} config - Configuración completa del bot (config.json)
 * @returns {{ context, page }} - Contexto y página de Playwright
 */
export async function abrirEdge(config) {
  const { path: edgePath, profile_dir } = config.edge;

  console.log('[browser] Cerrando Edge existente para usar su perfil...');
  await cerrarEdge();

  console.log('[browser] Iniciando Edge con perfil real...');
  const context = await chromium.launchPersistentContext(profile_dir, {
    headless: false,
    executablePath: edgePath,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',  // Oculta que es Playwright
    ],
    // Viewport realista
    viewport: { width: 1280, height: 800 },
    // User agent real de Edge
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  return { context, page };
}

/**
 * Delay aleatorio entre min y max ms para simular comportamiento humano.
 * @param {number} minMs
 * @param {number} maxMs
 */
export function delay(minMs = 1500, maxMs = 3500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}
