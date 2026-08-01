import { chromium } from 'playwright';
import { stdin, stdout, exit } from 'node:process';
import { execSync } from 'node:child_process';

function ask(question) {
  return new Promise(resolve => {
    stdout.write(question);
    let buf = '';
    stdin.resume();
    const cb = data => {
      buf += data.toString();
      if (buf.includes('\n')) {
        stdin.removeListener('data', cb);
        stdin.pause();
        resolve(buf.trim());
      }
    };
    stdin.on('data', cb);
  });
}

function log(msg) { console.log(`[BOT] ${msg}`); }

const EDGE_PATH = '/var/lib/flatpak/app/com.microsoft.Edge/x86_64/stable/326e26781e73f72614e139573c44451c8fecfbfc235e64cf2d35d07f373081bc/files/extra/msedge';
const PROFILE_DIR = '/home/zerausn/.var/app/com.microsoft.Edge/config/microsoft-edge';

async function main() {
  log('Cerrando Edge existente para usar su perfil...');
  try {
    execSync('pkill -f msedge');
    log('Edge cerrado.');
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    log('No se pudo cerrar Edge (o no estaba corriendo).');
  }

  log('Iniciando Edge con el perfil real (con tu sesión guardada)...');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: EDGE_PATH,
    args: ['--no-first-run', '--no-default-browser-check']
  });
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  const url = 'https://co.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-analista-comercial-sector-tecnologico-o-financiero-cali-en-cali-33E91AE13EDCD70B61373E686DCF3405';

  log('Navegando a la oferta...');
  await page.goto(url, { waitUntil: 'networkidle' });

  try {
    const cookieBtn = page.locator('.cc-dismiss, .cc-btn, button:has-text("Acepto")').first();
    if (await cookieBtn.count() > 0 && await cookieBtn.isVisible()) {
      await cookieBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

  const titulo = await page.textContent('h1');
  log(`Oferta: ${titulo.trim()}`);

  log('Click en "Aplicar"...');
  await page.locator('a:has-text("Aplicar")').first().click();
  await page.waitForTimeout(3000);
  log(`URL: ${page.url()}`);

  if (page.url().includes('Account/Login')) {
    log('Sigue pidiendo login... Logueate manualmente.');
    await ask('Presiona Enter después de loguearte...');
    await page.waitForTimeout(2000);
  }

  log(`URL final: ${page.url()}`);
  const texto = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  log(`\nContenido:\n${texto}`);

  await ask('\nPresiona Enter para cerrar...');
  await context.close();
}

main().catch(err => {
  console.error(err);
  exit(1);
});