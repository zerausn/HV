/**
 * screenshots.js — Captura de evidencias en cada paso del bot
 *
 * Guarda capturas de pantalla numeradas en screenshots/<fecha>/ para
 * poder depurar visualmente cualquier error o comportamiento extraño
 * (páginas que cambiaron, formularios inesperados, captchas, etc.).
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE_DIR = resolve(process.cwd(), 'screenshots');

/**
 * Captura un screenshot de la página actual.
 *
 * @param {import('playwright').Page} page
 * @param {string} nombre - Nombre del paso (ej: '1_navegacion_oferta')
 * @returns {Promise<string|null>} - Ruta del archivo o null si falló
 */
export async function capturar(page, nombre) {
  try {
    const fecha = new Date().toISOString().split('T')[0];
    const dir = join(BASE_DIR, fecha);
    mkdirSync(dir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
    const path = join(dir, `${ts}_${nombre}.png`);

    await page.screenshot({ path, fullPage: false });
    console.log(`  📸 [shot] ${path}`);
    return path;
  } catch (e) {
    console.error(`  📸 [shot] Error capturando "${nombre}": ${e.message}`);
    return null;
  }
}
