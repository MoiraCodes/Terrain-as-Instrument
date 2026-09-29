// Capture Bozeman dissolve sequence: progress = 0, 0.5, 1
// Requires the dev server running on http://localhost:3000.
// Usage: node capture-dissolve.mjs [scene]
//   scene: Bozeman (default) | Minneapolis | Grangeville | ...

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCENES = {
    Bozeman:            { file: 'models/Bozeman.ply',            camera: 'focal=0.228,2.708,3.592&angles=177.8,-11.9&distance=0.000' },
    Minneapolis:        { file: 'models/Minneapolis.ply',        camera: 'focal=-6.994,-8.949,39.634&angles=175.1,-13.8&distance=0.003' },
    'Mendocino County': { file: 'models/Mendocino County.ply',   camera: 'focal=0.537,0.453,2.161&angles=178.0,-3.2&distance=0.000' },
    'Lemmon SD':        { file: 'models/Lemmon SD.ply',          camera: 'focal=0.007,-0.783,2.957&angles=185.5,9.8&distance=0.002' },
    'Red River Valley': { file: 'models/Red River Valley.ply',   camera: 'focal=0.702,-0.543,11.770&angles=178.4,12.5&distance=0.006' },
    Grangeville:        { file: 'models/Grangeville.ply',        camera: 'focal=0.533,0.500,17.934&angles=178.9,-0.1&distance=0.003' },
    'Klamath Lake':     { file: 'models/Klamath Lake.ply',       camera: 'focal=-0.233,0.637,3.142&angles=185.9,0.5&distance=0.006' }
};

const sceneName = process.argv[2] || 'Bozeman';
const scene = SCENES[sceneName];
if (!scene) {
    console.error(`Unknown scene: ${sceneName}. Options: ${Object.keys(SCENES).join(', ')}`);
    process.exit(1);
}

const PROGRESSES = [0, 0.5, 1];
const ORIGIN = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'screenshots');
const VIEWPORT = { width: 1600, height: 1000 };
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

await fs.mkdir(OUT_DIR, { recursive: true });

const plyUrl = `${ORIGIN}/${encodeURI(scene.file)}`;
const editorUrl = `${ORIGIN}/editor/?load=${encodeURIComponent(plyUrl)}&${scene.camera}`;

console.log(`Launching Chrome...`);
const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // Block person-distance.json so the gesture controller doesn't overwrite our progress.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.url().includes('person-distance.json')) {
            req.respond({ status: 404, body: '' });
        } else {
            req.continue();
        }
    });

    page.on('console', (msg) => {
        const t = msg.type();
        if (t === 'error' || t === 'warning') console.log(`[page:${t}]`, msg.text());
    });

    console.log(`Loading ${editorUrl}`);
    await page.goto(editorUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for scene + splat to be ready.
    console.log(`Waiting for splat to load...`);
    await page.waitForFunction(() => {
        const s = window.scene;
        if (!s || !s.events || !s.getElementsByType) return false;
        const splats = s.getElementsByType('splat');
        if (!splats || splats.length === 0) return false;
        const inst = splats[0].entity?.gsplat?.instance;
        return !!inst;
    }, { timeout: 60000, polling: 200 });

    // Give it a moment to settle (camera framing, first render).
    await new Promise(r => setTimeout(r, 1500));

    // The editor hides most UI automatically when loaded with ?load=.
    // Also hide the "← Gallery" back button and any lingering toolbars/panels.
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.id = 'capture-hide-ui';
        style.textContent = `
            #canvas-container > *:not(#canvas) { display: none !important; }
            body > a { display: none !important; }
        `;
        document.head.appendChild(style);
    });

    // Set dissolve as the active effect (gesture controller set it to 'noise').
    await page.evaluate(() => {
        window.scene.events.fire('particle.setEffect', 'dissolve');
    });

    const canvas = await page.$('#canvas');
    if (!canvas) throw new Error('canvas element not found');

    for (const p of PROGRESSES) {
        await page.evaluate((v) => {
            window.scene.events.fire('particle.setProgress', v);
            window.scene.forceRender = true;
        }, p);

        // Let the shader render a fresh frame.
        await new Promise(r => setTimeout(r, 400));

        const outPath = path.join(OUT_DIR, `${sceneName.replace(/\s+/g, '_')}_dissolve_${p.toString().replace('.', '_')}.png`);
        await canvas.screenshot({ path: outPath });
        console.log(`  progress=${p}  →  ${path.relative(__dirname, outPath)}`);
    }

    console.log(`Done. 3 screenshots written to ${path.relative(__dirname, OUT_DIR)}/`);
} finally {
    await browser.close();
}
