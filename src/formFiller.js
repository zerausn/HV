/**
 * formFiller.js — Relleno automático de formularios con caché de respuestas
 *
 * Flujo por cada campo/pregunta detectada:
 *   1. Lee el label/texto de la pregunta
 *   2. Busca en preguntas.json si ya tienes una respuesta guardada
 *   3. Si SÍ → rellena automáticamente (sin preguntarte)
 *   4. Si NO → te muestra la pregunta en terminal, espera tu respuesta,
 *              la guarda en caché para siempre
 */

import { delay } from './browser.js';
import {
  buscarRespuestaEnCache,
  preguntarAlUsuario,
  marcarUsada,
} from './preguntas.js';

// ─── Helpers DOM ─────────────────────────────────────────────────────────────

/**
 * Extrae el texto de la etiqueta asociada a un campo de formulario.
 * Busca: <label for="id">, aria-label, placeholder, texto cercano, etc.
 */
async function obtenerLabelDeCampo(page, elemento) {
  return await elemento.evaluate(el => {
    // 1. aria-label directo
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');

    // 2. <label for="id">
    const id = el.id || el.getAttribute('name');
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.innerText || label.textContent;
    }

    // 3. Label contenedor (el campo está dentro del label)
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.innerText || parentLabel.textContent;

    // 4. Elemento hermano o padre con texto de pregunta
    const parent = el.parentElement;
    if (parent) {
      // Buscar el primer texto visible en el contenedor
      const textoParent = (parent.innerText || parent.textContent || '').trim();
      if (textoParent && textoParent.length < 200) return textoParent;

      // Ir un nivel más arriba
      const abuelo = parent.parentElement;
      if (abuelo) {
        const textoAbuelo = (abuelo.querySelector('label, p, span, div')?.innerText || '').trim();
        if (textoAbuelo && textoAbuelo.length < 200) return textoAbuelo;
      }
    }

    // 5. placeholder como fallback
    return el.getAttribute('placeholder') || el.getAttribute('name') || '';
  });
}

/**
 * Extrae las opciones visibles de un <select>.
 */
async function obtenerOpcionesSelect(selectEl) {
  return await selectEl.evaluate(el => {
    return Array.from(el.options)
      .filter(o => o.value && o.value !== '' && o.value !== '0')
      .map(o => o.text.trim())
      .filter(t => t.length > 0);
  });
}

/**
 * Extrae labels de un grupo de radios/checkboxes.
 */
async function obtenerOpcionesRadio(page, grupoNombre) {
  return await page.evaluate(nombre => {
    const inputs = document.querySelectorAll(`input[type="radio"][name="${nombre}"], input[type="checkbox"][name="${nombre}"]`);
    const opciones = [];
    for (const input of inputs) {
      // Intentar por ID -> label[for=id]
      const id = input.id;
      let labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
      
      // Intentar por contenedor (el input está dentro del label)
      if (!labelEl) {
        labelEl = input.closest('label');
      }

      // Intentar por hermano (el texto está junto al input en un span)
      let texto = '';
      if (labelEl) {
        texto = labelEl.innerText || labelEl.textContent || '';
      } else {
        const next = input.nextElementSibling;
        if (next && (next.tagName === 'SPAN' || next.tagName === 'LABEL' || next.tagName === 'P')) {
          texto = next.innerText || next.textContent || '';
        }
      }

      texto = texto.trim() || input.value || '';
      if (texto) opciones.push(texto);
    }
    return opciones;
  }, grupoNombre);
}

// ─── Procesadores por tipo de campo ──────────────────────────────────────────

async function procesarCampoTexto(page, campo, perfil) {
  const label = await obtenerLabelDeCampo(page, campo);
  if (!label || label.length < 3) return;

  // Verificar si ya tiene valor
  const valorActual = await campo.inputValue().catch(() => '');
  if (valorActual.trim()) return; // ya relleno, no tocar

  // Intentar relleno automático con datos del perfil (campos básicos)
  const labelNorm = label.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes para comparar
    .replace(/[¿?¡!]/g, '');

  let respuestaDirecta = null;

  // ── Celular / Teléfono ───────────────────────────────────────────
  // Captura: celular, teléfono, telefono, móvil, movil, contacto, whatsapp,
  //          número de contacto, número actualizado, cel, num, llamadas
  if (/celular|tel[ée]?fono|movil|m[oó]vil|whatsapp|numero.*(contacto|actualizado)|contacto.*(numero|actualizado)|n[uú]mero.*(llamada|wh)|cel\b|num\b/.test(labelNorm) && perfil.telefono)
    respuestaDirecta = String(perfil.telefono);

  // ── Nombre ───────────────────────────────────────────────────────
  else if (/\bnombre\b/.test(labelNorm) && !/empresa|razon|social|compan/.test(labelNorm) && perfil.nombre)
    respuestaDirecta = perfil.nombre;

  // ── Email / Correo ───────────────────────────────────────────────
  else if (/email|correo|mail/.test(labelNorm) && perfil.email)
    respuestaDirecta = perfil.email;

  // ── Ciudad ───────────────────────────────────────────────────────
  else if (/\bciudad\b|lugar.*residencia|reside/.test(labelNorm) && perfil.ciudad)
    respuestaDirecta = perfil.ciudad;

  // ── Salario / Aspiración ─────────────────────────────────────────
  else if (/salario|aspiraci[oó]n|pretenci|expectativa.*salarial|sueldo/.test(labelNorm) && perfil.salario_minimo)
    respuestaDirecta = String(perfil.salario_minimo);


  if (respuestaDirecta) {
    await campo.fill(respuestaDirecta);
    await delay(200, 500);
    return;
  }

  // Buscar en caché
  const cached = buscarRespuestaEnCache(label);
  if (cached) {
    console.log(`\x1b[90m[form] Caché: "${label.substring(0, 50)}" → "${cached.respuesta}"\x1b[0m`);
    await campo.fill(cached.respuesta);
    marcarUsada(cached.entrada);
    await delay(4000, 7000);
    return;
  }

  // Preguntar al usuario
  const respuesta = await preguntarAlUsuario(label, [], 'text');
  if (respuesta) {
    await campo.fill(respuesta);
    await delay(200, 400);
  }
}

async function procesarSelect(page, campo, perfil) {
  const label = await obtenerLabelDeCampo(page, campo);
  if (!label || label.length < 3) return;

  // Ver si ya tiene selección
  const valorActual = await campo.evaluate(el => el.value || '');
  if (valorActual && valorActual !== '0' && valorActual !== '') return;

  const opciones = await obtenerOpcionesSelect(campo);
  if (opciones.length === 0) return;

  // Buscar en caché
  const cached = buscarRespuestaEnCache(label);
  if (cached) {
    console.log(`\x1b[90m[form] Caché select: "${label.substring(0, 50)}" → "${cached.respuesta}"\x1b[0m`);
    try {
      // Intentar seleccionar por texto
      await campo.selectOption({ label: cached.respuesta });
    } catch {
      // Si falla, buscar opción que contenga la respuesta
      const match = opciones.find(o => o.toLowerCase().includes(cached.respuesta.toLowerCase()));
      if (match) await campo.selectOption({ label: match });
    }
    marcarUsada(cached.entrada);
    await delay(4000, 7000);
    return;
  }

  // Preguntar al usuario con las opciones disponibles
  const respuesta = await preguntarAlUsuario(label, opciones, 'select');
  if (respuesta) {
    try {
      await campo.selectOption({ label: respuesta });
    } catch {
      const match = opciones.find(o => o.toLowerCase().includes(respuesta.toLowerCase()));
      if (match) await campo.selectOption({ label: match });
    }
    await delay(200, 400);
  }
}

async function procesarRadioGroup(page, nombre, perfil) {
  const opciones = await obtenerOpcionesRadio(page, nombre);
  if (opciones.length === 0) return;

  // Verificar si ya hay uno seleccionado
  const yaSeleccionado = await page.evaluate(n => {
    return !!document.querySelector(`input[type="radio"][name="${n}"]:checked`);
  }, nombre);
  if (yaSeleccionado) return;

  // Buscar label del grupo (la pregunta en sí)
  const label = await page.evaluate(n => {
    const firstInput = document.querySelector(`input[type="radio"][name="${n}"]`);
    if (!firstInput) return n;
    
    // Subir en el DOM buscando al ancestro más cercano que contenga la pregunta
    let current = firstInput.closest('.field_radio_box, .field_radio, .group, .box_border') || firstInput.parentElement;
    
    while (current && current.tagName !== 'BODY') {
      // 1. Revisar los hermanos anteriores inmediatos
      let prev = current.previousElementSibling;
      while (prev) {
        const text = prev.innerText ? prev.innerText.trim() : prev.textContent?.trim();
        const isOption = prev.querySelector('input') || prev.closest('label');
        const isGenericHeader = /preguntas de selecci[oó]n|killerquestions/i.test(text);
        
        if (text && text.length > 5 && !isOption && !isGenericHeader) {
          return text;
        }
        prev = prev.previousElementSibling;
      }

      // 2. Revisar si el contenedor actual tiene un título/párrafo como primer hijo
      const firstChild = current.firstElementChild;
      if (firstChild && ['P', 'LEGEND', 'H3', 'H4', 'LABEL', 'DIV'].includes(firstChild.tagName)) {
        const text = firstChild.innerText ? firstChild.innerText.trim() : '';
        const isOption = firstChild.querySelector('input') || firstChild.closest('label');
        const isGenericHeader = /preguntas de selecci[oó]n|killerquestions/i.test(text);
        
        // Exigir que sea un texto sustancial y que no sea el mismo contenedor en el que estamos
        if (text.length > 5 && text.length < 500 && !isOption && !isGenericHeader && firstChild !== firstInput.closest('div')) {
          // Si el texto parece una pregunta
          return text;
        }
      }

      current = current.parentElement;
    }
    
    return n;
  }, nombre);

  // Buscar en caché
  const cached = buscarRespuestaEnCache(label);
  if (cached) {
    console.log(`\x1b[90m[form] Caché radio: "${label.substring(0, 50)}" → "${cached.respuesta}"\x1b[0m`);
    try {
      await page.locator(`input[type="radio"][name="${nombre}"] + label:has-text("${cached.respuesta}")`).click();
    } catch {
      // Buscar por valor parcial
      const match = opciones.find(o => o.toLowerCase().includes(cached.respuesta.toLowerCase()));
      if (match) {
        await page.locator(`input[type="radio"][value="${match}"], label:has-text("${match}")`).first().click();
      }
    }
    marcarUsada(cached.entrada);
    await delay(4000, 7000);
    return;
  }

  // Preguntar al usuario
  const respuesta = await preguntarAlUsuario(label, opciones, 'radio');
  if (respuesta) {
    try {
      const match = opciones.find(o => o.toLowerCase().includes(respuesta.toLowerCase())) || respuesta;
      await page.locator(`label:has-text("${match}")`).first().click();
    } catch { /* ok */ }
    await delay(200, 400);
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Analiza todos los campos de formulario visibles en la página,
 * los rellena desde caché o preguntando al usuario.
 *
 * @param {import('playwright').Page} page
 * @param {object} perfil - config.perfil
 * @returns {Promise<boolean>} - true si pudo avanzar/enviar
 */
export async function rellenarFormulario(page, perfil) {
  console.log('[form] Analizando formulario...');

  try {
    // ── 1. Subir CV si hay campo de archivo ──────────────────────────
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      if (perfil.cv_pdf) {
        console.log(`[form] Subiendo CV: ${perfil.cv_pdf}`);
        await fileInput.setInputFiles(perfil.cv_pdf);
        await delay(1000, 2000);
      } else {
        console.log('[form] AVISO: Se pide CV pero cv_pdf no está configurado en config.json.');
      }
    }

    // ── 2. Inputs de texto y textarea visibles ────────────────────────
    const textInputs = await page.locator(
      'input[type="text"]:visible, input[type="number"]:visible, ' +
      'input[type="email"]:visible, input[type="tel"]:visible, textarea:visible'
    ).all();

    for (const campo of textInputs) {
      try {
        if (!(await campo.isVisible())) continue;
        await procesarCampoTexto(page, campo, perfil);
      } catch (e) {
        // Campo desapareció o no es interactivo, continuar
      }
    }

    // ── 3. Selects visibles ───────────────────────────────────────────
    const selects = await page.locator('select:visible').all();
    for (const campo of selects) {
      try {
        if (!(await campo.isVisible())) continue;
        await procesarSelect(page, campo, perfil);
      } catch { /* ok */ }
    }

    // ── 4. Grupos de radio buttons visibles ───────────────────────────
    const nombresRadio = await page.evaluate(() => {
      const nombres = new Set();
      document.querySelectorAll('input[type="radio"]:not([disabled])').forEach(el => {
        // Ignorar si está dentro de un modal, popup, o formulario de reporte
        if (el.closest('.modal, [id*="report"], [id*="popup"], .report-form, [id*="modal"]')) {
          return;
        }

        // Ignorar por nombre de campo obvio de reporte
        if (el.name === 'Reasons' || el.name === 'ReportReason') {
          return;
        }

        // Solo considerar los que sean "visibles"
        if (el.name && el.offsetWidth > 0 && el.offsetHeight > 0) {
          nombres.add(el.name);
        } else {
          // Playwright a veces oculta el radio real pero muestra un ::before,
          // checkear si el contenedor padre es visible
          const parent = el.closest('div, label, li');
          if (parent && parent.offsetWidth > 0 && parent.offsetHeight > 0) {
            nombres.add(el.name);
          }
        }
      });
      return Array.from(nombres);
    });

    for (const nombre of nombresRadio) {
      try {
        await procesarRadioGroup(page, nombre, perfil);
      } catch { /* ok */ }
    }

    await delay(500, 1000);

    // ── 5. Buscar botón de avance ─────────────────────────────────────
    const botonesAvance = [
      'button:has-text("Enviar")',
      'button:has-text("Enviar mi CV")',
      'button:has-text("Continuar")',
      'button:has-text("Siguiente")',
      'button:has-text("Postularme")',
      'button:has-text("Aplicar")',
      'button:has-text("Inscribirme")',
      '#btnSubmit',
      'button[type="submit"]',
      'input[type="submit"]',
    ];

    for (const sel of botonesAvance) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isVisible()) {
          const texto = (await btn.textContent())?.trim() || '';
          console.log(`[form] Clic en botón: "${texto}"`);
          await btn.click();
          await delay(2000, 3000);
          return true;
        }
      } catch { continue; }
    }

    console.log('[form] No se encontró botón de avance reconocible.');
    return false;

  } catch (err) {
    console.error(`[form] Error: ${err.message}`);
    return false;
  }
}
