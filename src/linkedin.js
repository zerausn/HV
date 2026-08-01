/**
 * linkedin.js — Lógica específica de LinkedIn Easy Apply
 * https://www.linkedin.com
 *
 * Usa la función "Easy Apply" (postulación directa dentro de LinkedIn)
 * cuando está disponible. Para ofertas externas, hace clic y registra.
 */

import { delay } from './browser.js';
import { rellenarFormulario } from './formFiller.js';

const BASE_URL = 'https://www.linkedin.com';

function construirUrlBusqueda(busqueda) {
  // LinkedIn Jobs: /jobs/search/?keywords=cargo&location=ciudad&f_AL=true (Easy Apply filter)
  const keywords = encodeURIComponent(busqueda.cargo || 'analista');
  const location = encodeURIComponent(busqueda.ciudad || 'Cali, Valle del Cauca, Colombia');
  // f_AL=true = Solo "Easy Apply"
  return `${BASE_URL}/jobs/search/?keywords=${keywords}&location=${location}&f_AL=true`;
}

async function cerrarModalSiAparece(page) {
  try {
    const closeBtn = page.locator('[aria-label="Descartar"], [aria-label="Dismiss"], button[data-test-modal-close-btn]').first();
    if (await closeBtn.count() > 0 && await closeBtn.isVisible()) {
      await closeBtn.click();
      await delay(500, 1000);
    }
  } catch { /* ok */ }
}

export async function buscarOfertas(page, config) {
  const url = construirUrlBusqueda(config.busqueda);
  const max = config.busqueda.max_ofertas_por_sesion || 15;

  console.log(`[linkedin] Buscando: "${config.busqueda.cargo}" en "${config.busqueda.ciudad}" (Easy Apply)`);
  console.log(`[linkedin] URL: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2500, 4000);

  // LinkedIn puede redirigir a login
  if (page.url().includes('/login') || page.url().includes('/authwall')) {
    console.log('[linkedin] ATENCIÓN: LinkedIn redirigió a login. Inicia sesión en Edge primero.');
    return [];
  }

  try {
    await page.waitForSelector('.job-card-container, .jobs-search__results-list li, .scaffold-layout__list-container li', { timeout: 12000 });
  } catch {
    console.log('[linkedin] AVISO: No se encontraron tarjetas. URL actual:', page.url());
    return [];
  }

  // Scroll para cargar más
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await delay(600, 1000);
  }

  const urls = await page.evaluate((baseUrl) => {
    const links = new Set();
    // LinkedIn tiene dos formatos de URL de oferta
    document.querySelectorAll('a[href*="/jobs/view/"]').forEach(a => {
      const href = a.getAttribute('href');
      if (href) {
        // Limpiar parámetros extras, quedarse solo con el ID
        const clean = href.split('?')[0];
        links.add(clean.startsWith('http') ? clean : baseUrl + clean);
      }
    });
    return Array.from(links);
  }, BASE_URL);

  console.log(`[linkedin] Encontradas ${urls.length} oferta(s) con Easy Apply. Limitando a ${max}.`);
  return urls.slice(0, max);
}

export async function aplicarOferta(page, url, config) {
  const minDelay = config.busqueda.delay_min_ms || 1500;
  const maxDelay = config.busqueda.delay_max_ms || 3500;

  console.log(`\n[linkedin] → Navegando a: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(minDelay, maxDelay);
  await cerrarModalSiAparece(page);

  if (page.url().includes('/login') || page.url().includes('/authwall')) {
    return { ok: false, titulo: url, empresa: '', motivo: 'requiere_login' };
  }

  let titulo = '';
  let empresa = '';
  try {
    titulo = (await page.textContent('h1.t-24, .job-details-jobs-unified-top-card__job-title, h1'))?.trim() || 'Sin título';
    empresa = (await page.textContent('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link'))?.trim() || 'Sin empresa';
  } catch { titulo = 'Sin título'; }

  console.log(`[linkedin] Oferta: "${titulo}" — ${empresa}`);

  // Verificar si ya aplicamos
  const yaAplicado = await page.locator('span:has-text("Solicitud enviada"), .artdeco-inline-feedback--success').count();
  if (yaAplicado > 0) {
    console.log('[linkedin] Ya estabas postulado.');
    return { ok: false, titulo, empresa, motivo: 'ya_postulado' };
  }

  // Botón Easy Apply
  const easyApplyBtn = page.locator('button:has-text("Solicitud sencilla"), button:has-text("Easy Apply"), button[data-job-id]').first();
  if (await easyApplyBtn.count() === 0 || !(await easyApplyBtn.isVisible())) {
    console.log('[linkedin] No es Easy Apply (oferta externa). Registrando solo URL.');
    return { ok: false, titulo, empresa, motivo: 'no_easy_apply' };
  }

  await easyApplyBtn.click();
  await delay(2000, 3000);

  // El modal de Easy Apply tiene múltiples pasos. Navegamos todos los "Siguiente".
  let pasos = 0;
  const maxPasos = 8;
  while (pasos < maxPasos) {
    pasos++;

    // Rellenar lo que sea posible en este paso
    const hayForm = await page.locator('.jobs-easy-apply-content form').count() > 0;
    if (hayForm) {
      await rellenarFormulario(page, config.perfil);
      await delay(800, 1500);
    }

    // Botón "Revisar" o "Enviar solicitud" (último paso)
    const btnEnviar = page.locator('button:has-text("Enviar solicitud"), button:has-text("Submit application")').first();
    if (await btnEnviar.count() > 0 && await btnEnviar.isVisible()) {
      await btnEnviar.click();
      await delay(2000, 3000);
      console.log('[linkedin] ✅ Solicitud enviada.');
      // Cerrar modal de confirmación
      await cerrarModalSiAparece(page);
      return { ok: true, titulo, empresa };
    }

    // Botón "Siguiente"
    const btnSig = page.locator('button:has-text("Siguiente"), button:has-text("Next"), button:has-text("Continuar")').first();
    if (await btnSig.count() > 0 && await btnSig.isVisible()) {
      await btnSig.click();
      await delay(1500, 2500);
      continue;
    }

    // Botón "Revisar" (penúltimo paso)
    const btnRevisar = page.locator('button:has-text("Revisar"), button:has-text("Review")').first();
    if (await btnRevisar.count() > 0 && await btnRevisar.isVisible()) {
      await btnRevisar.click();
      await delay(1500, 2500);
      continue;
    }

    // Si no hay botón reconocible, salir del bucle
    console.log(`[linkedin] Paso ${pasos}: sin botón reconocible. Revisión manual.`);
    break;
  }

  return { ok: false, titulo, empresa, motivo: 'flujo_incompleto' };
}
