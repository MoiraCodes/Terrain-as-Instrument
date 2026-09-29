// Nano 33 IoT button → scene switcher
// Polls /scene-state.json (written by osc-bridge.mjs on serial BTN input)
// Also binds keyboard 1-5 for manual testing.

type SceneDef = { file: string, camera: string };

const SCENES: Record<number, SceneDef> = {
    1: { file: 'Minneapolis.ply', camera: 'focal=-6.994,-8.949,39.634&angles=175.1,-13.8&distance=0.003' },
    2: { file: 'Lemmon SD.ply', camera: 'focal=0.007,-0.783,2.957&angles=185.5,9.8&distance=0.002' },
    3: { file: 'Klamath Lake.ply', camera: 'focal=-0.233,0.637,3.142&angles=185.9,0.5&distance=0.006' },
    4: { file: 'Bozeman.ply', camera: 'focal=0.929,2.972,-3.225&angles=182.1,3.5&distance=0.000' },
    5: { file: 'Mendocino County.ply', camera: 'focal=0.537,0.453,2.161&angles=178.0,-3.2&distance=0.000' }
};

class SceneController {
    private lastBtnTs = -1;

    constructor() {
        this.startPolling();
        this.bindKeyboard();
    }

    private goScene(n: number) {
        const scene = SCENES[n];
        if (!scene) return;
        const base = window.location.origin + window.location.pathname;
        const plyUrl = new URL(`../models/${scene.file}`, base).href;
        window.location.href = `${base}?load=${encodeURIComponent(plyUrl)}&${scene.camera}`;
    }

    private startPolling() {
        const poll = async () => {
            try {
                const res = await fetch(`/scene-state.json?${Date.now()}`);
                if (!res.ok) return;
                const data = await res.json();
                // On first successful read, record current ts so we don't auto-jump on load
                if (this.lastBtnTs < 0) {
                    this.lastBtnTs = data.ts ?? 0;
                    return;
                }
                if (data.btn >= 1 && data.btn <= 5 && data.ts > this.lastBtnTs) {
                    this.lastBtnTs = data.ts;
                    this.goScene(data.btn);
                }
            } catch {
                // bridge not running, ignore
            }
        };
        poll();
        window.setInterval(poll, 300);
    }

    private bindKeyboard() {
        window.addEventListener('keydown', (e) => {
            const n = parseInt(e.key);
            if (n >= 1 && n <= 5) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.goScene(n);
            }
        }, true);
    }
}

export { SceneController };
