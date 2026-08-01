/**
 * computrabajo.js — Lógica específica de Computrabajo Colombia
 *
 * Dos operaciones principales:
 *   1. buscarOfertas()  — Navega a resultados de búsqueda y extrae URLs
 *   2. aplicarOferta()  — Abre una oferta y ejecuta el flujo de postulación
 */

import { delay } from './browser.js';
import { rellenarFormulario } from './formFiller.js';

const BASE_URL = 'https://co.computrabajo.com';

/**
 * Construye la URL de búsqueda de Computrabajo con los filtros del config.
 * @param {object} busqueda - config.busqueda
 */
function construirUrlBusqueda(busqueda) {
  const cargo = encodeURIComponent(busqueda.cargo || 'analista');
  const ciudad = encodeURIComponent(busqueda.ciudad || 'cali');
  // Computrabajo filtra ciudad en la URL como parámetro l= y cargo como q=
  return `${BASE_URL}/trabajo-de-${encodeURIComponent(busqueda.cargo || 'analista')}?l=${encodeURIComponent(busqueda.ciudad || 'Cali')}`;
}

/**
 * Acepta el banner de cookies si aparece.
 * @param {import('playwright').Page} page
 */
async function aceptarCookies(page) {
  try {
    const cookieBtn = page.locator(
      '.cc-dismiss, .cc-btn, button:has-text("Acepto"), button:has-text("Aceptar")'
    ).first();
    if (await cookieBtn.count() > 0 && await cookieBtn.isVisible()) {
      await cookieBtn.click();
      await delay(500, 1000);
    }
  } catch {
    // Sin banner de cookies, ok
  }
}

/**
 * Navega a la página de resultados y extrae las URLs de las ofertas.
 *
 * @param {import('playwright').Page} page
 * @param {object} config - Configuración completa
 * @returns {string[]} - Array de URLs absolutas de cada oferta
 */
export async function buscarOfertas(page, config) {
  const url = construirUrlBusqueda(config.busqueda);
  const max = config.busqueda.max_ofertas_por_sesion || 15;

  console.log(`[computrabajo] Buscando: "${config.busqueda.cargo}" en "${config.busqueda.ciudad}"`);
  console.log(`[computrabajo] URL: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000, 3000);
  await aceptarCookies(page);

  // Esperar que carguen las tarjetas de oferta
  try {
    await page.waitForSelector('article.g_card, .offerListItem, article[data-regid]', { timeout: 10000 });
  } catch {
    console.log('[computrabajo] AVISO: No se encontraron tarjetas de oferta. La estructura del DOM puede haber cambiado.');
    console.log('[computrabajo] URL actual:', page.url());
    return [];
  }

  // Extraer hrefs de las tarjetas de oferta
  const urls = await page.evaluate((baseUrl) => {
    const links = new Set();

    // Selector principal de Computrabajo (tarjetas de oferta)
    const selectores = [
      'article.g_card a[href*="/oferta-de-trabajo"]',
      'article[data-regid] a[href*="/oferta-de-trabajo"]',
      '.offerListItem a[href*="/oferta-de-trabajo"]',
      'a[href*="/oferta-de-trabajo-de-"]',
    ];

    for (const sel of selectores) {
      document.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (href) {
          const full = href.startsWith('http') ? href : baseUrl + href;
          links.add(full);
        }
      });
    }

    return Array.from(links);
  }, BASE_URL);

  console.log(`[computrabajo] Encontradas ${urls.length} oferta(s). Limitando a ${max}.`);
  return urls.slice(0, max);
}

/**
 * Aplica a una oferta de trabajo en Computrabajo.
 *
 * @param {import('playwright').Page} page
 * @param {string} url - URL de la oferta
 * @param {object} config - Configuración completa
 * @returns {{ ok: boolean, titulo: string, empresa: string, motivo?: string }}
 */
export async function aplicarOferta(page, url, config) {
  const minDelay = config.busqueda.delay_min_ms || 1500;
  const maxDelay = config.busqueda.delay_max_ms || 3500;

  console.log(`\n[computrabajo] → Navegando a: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Esperar a que cargue el contenido dinámico (el botón de aplicar carga tarde)
  await Promise.race([
    page.waitForSelector('[attach-cv-button-text], a:has-text("Inscribirme"), button:has-text("Aplicar")', { timeout: 8000 }),
    delay(4000, 5000), // máximo 5s de espera si no aparece
  ]).catch(() => {}); // no fallar si no aparece

  await aceptarCookies(page);

  // Extraer título y empresa — usar selectores específicos de oferta
  let titulo = '';
  let empresa = '';
  try {
    // En página de oferta real: el título NO es h1.title_page (ese es el buscador)
    // Intentamos selectores específicos de la ficha de oferta
    titulo = (await page.textContent('.title_offer, h1:not(.title_page), .fs21.fwB.mt10, .job-title').catch(() => null))?.trim()
          || 'Sin título';
    // Empresa: buscar dentro del bloque de detalle, NO del menú de nav
    empresa = (await page.textContent('.t_s16.fc_base.mt5, .companyName, [data-cy="company-name"], .company_name, article .fc_base.fwB:not([href*="/empresas/"])').catch(() => null))?.trim() || '';
  } catch {
    titulo = 'Sin título';
  }

  console.log(`[computrabajo] Oferta: "${titulo}" — ${empresa}`);

  // Verificar si ya estamos postulados
  const yaPostulado = await page.locator(
    'button:has-text("Ya te has inscrito"), .already-applied, [data-cy="already-applied"]'
  ).count();
  if (yaPostulado > 0) {
    console.log('[computrabajo] Ya estabas postulado a esta oferta.');
    return { ok: false, titulo, empresa, motivo: 'ya_postulado' };
  }

  // Detectar si la oferta ya no existe o redirigió al listado de búsqueda
  const urlActual = page.url();
  const esPaginaOfertaUrl = urlActual.includes('/oferta-de-trabajo-') || urlActual.includes('?fgoa=');

  if (!esPaginaOfertaUrl || titulo === 'Sin título') {
    console.log(`[computrabajo] La oferta ya no está disponible o expiró (sin título).`);
    return { ok: false, titulo, empresa, motivo: 'oferta_no_disponible' };
  }

  const selectoresAplicar = [
    '[attach-cv-button-text]',          // botón principal real de Computrabajo
    '[data-apply-ac]',
    '[offer-detail-button]',
    'span:has-text("Aplicar")',
    'a:has-text("Inscribirme")',
    'button:has-text("Inscribirme")',
    'a:has-text("Aplicar")',
    'button:has-text("Aplicar")',
    'a:has-text("Postularme")',
    'button:has-text("Postularme")',
    '#apply_job',
    '#btnSubmit',
    '[data-cy="btn-apply"]',
    '.apply-btn',
  ];

  let aplicado = false;
  for (const sel of selectoresAplicar) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        console.log(`[computrabajo] Clic en botón: "${await btn.textContent()}"`);
        await btn.click();
        await delay(2500, 4000);
        aplicado = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!aplicado) {
    console.log('[computrabajo] No se encontró botón de postulación.');
    return { ok: false, titulo, empresa, motivo: 'sin_boton' };
  }

  // Verificar si se requiere login
  if (page.url().includes('Account/Login') || page.url().includes('/login')) {
    console.log('[computrabajo] ATENCIÓN: Redirigió a login. La sesión puede haber expirado.');
    return { ok: false, titulo, empresa, motivo: 'requiere_login' };
  }

  // Intentar rellenar formulario si apareció uno
  const hayFormulario = await page.locator('form').count() > 0;
  if (hayFormulario) {
    await rellenarFormulario(page, config.perfil);
    await delay(minDelay, maxDelay);
  }

  // Confirmar éxito: buscar mensajes de confirmación
  const textosPagina = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  const confirmaciones = [
    'te has inscrito', 'inscripción exitosa', 'postulación enviada',
    'gracias por aplicar', 'aplicación enviada', 'has aplicado',
  ];
  const confirmado = confirmaciones.some(c => textosPagina.toLowerCase().includes(c));

  if (confirmado) {
    console.log('[computrabajo] ✅ Postulación confirmada.');
  } else {
    console.log('[computrabajo] ⚠️  No se encontró confirmación explícita. Revisa el navegador.');
  }

  return { ok: true, titulo, empresa };
}
