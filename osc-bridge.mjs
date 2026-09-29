// OSC (UDP) → JSON file bridge
// Listens for /person/* OSC messages from orbbec_syphon and writes to person-distance.json
// Run: node osc-bridge.mjs

import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SerialPort, ReadlineParser } from 'serialport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, 'person-distance.json');
const TMP_FILE = OUT_FILE + '.tmp';
const SCENE_FILE = path.join(__dirname, 'scene-state.json');
const PORT = 7000;

// Atomic write: write to a sibling .tmp then rename. Without this, npx serve
// (HTTP-fetched 30Hz by the frontend) can stat OUT_FILE between writeFileSync's
// truncate and rewrite — sending a Content-Length that doesn't match the bytes
// it ends up reading. Browser aborts with ERR_CONTENT_LENGTH_MISMATCH.
function atomicWriteOut(text) {
    fs.writeFileSync(TMP_FILE, text);
    fs.renameSync(TMP_FILE, OUT_FILE);
}

// Forward OSC to Max/MSP
const MAX_HOST = '127.0.0.1';
const MAX_PORT = parseInt(process.argv[2]) || 8000;
const forwardSocket = dgram.createSocket('udp4');

// Nano 33 IoT button via USB serial → /scene OSC
function findNanoSerial() {
    if (process.env.NANO_SERIAL) return process.env.NANO_SERIAL;
    try {
        const entries = fs.readdirSync('/dev').filter(n => n.startsWith('tty.usbmodem'));
        if (entries.length > 0) return `/dev/${entries[0]}`;
    } catch {}
    return null; // no Nano detected — connectSerial() will skip silently
}
const NANO_SERIAL = findNanoSerial();
const SERIAL_BAUD = 9600;

const state = { distance: 0, x: 0.5, y: 0.5, count: 0, tooClose: 0 };

function buildOSCMessage(address, floatValue) {
    // address string, padded to 4 bytes
    const addrBuf = Buffer.from(address + '\0');
    const addrPad = Buffer.alloc((4 - (addrBuf.length % 4)) % 4);
    // type tag ',f\0' padded to 4 bytes
    const typeBuf = Buffer.from(',f\0\0');
    // float value
    const valBuf = Buffer.alloc(4);
    valBuf.writeFloatBE(floatValue, 0);
    return Buffer.concat([addrBuf, addrPad, typeBuf, valBuf]);
}

function buildOSCInt(address, intValue) {
    const addrBuf = Buffer.from(address + '\0');
    const addrPad = Buffer.alloc((4 - (addrBuf.length % 4)) % 4);
    const typeBuf = Buffer.from(',i\0\0');
    const valBuf = Buffer.alloc(4);
    valBuf.writeInt32BE(intValue, 0);
    return Buffer.concat([addrBuf, addrPad, typeBuf, valBuf]);
}

function parseOSCFloat(buf, offset) {
    const b = Buffer.alloc(4);
    b[0] = buf[offset];
    b[1] = buf[offset + 1];
    b[2] = buf[offset + 2];
    b[3] = buf[offset + 3];
    return b.readFloatBE(0);
}

function parseOSCMessage(buf) {
    // Read address string (null-terminated, padded to 4 bytes)
    let i = 0;
    while (i < buf.length && buf[i] !== 0) i++;
    const address = buf.toString('ascii', 0, i);
    i = (i + 4) & ~3; // pad to 4

    // Read type tag string
    let j = i;
    while (j < buf.length && buf[j] !== 0) j++;
    const typetag = buf.toString('ascii', i, j);
    j = (j + 4) & ~3;

    // Read all float arguments
    const values = [];
    for (const ch of typetag.slice(1)) { // skip leading ','
        if (ch === 'f' && j + 4 <= buf.length) {
            values.push(parseOSCFloat(buf, j));
            j += 4;
        }
    }
    if (values.length > 0) {
        return { address, values };
    }
    return null;
}

const server = dgram.createSocket('udp4');

function commitFrame() {
    const isPlaceholder = state.count === 0 || (state.x === 0.5 && state.y === 0.5);
    // Lower bound is the backend's MIN_MM (set via env in start.sh); bridge
    // only enforces the upper bound. Otherwise close-range detections (when
    // MIN_MM=0) get silently filtered here, looking like "no person" to the
    // frontend.
    const outOfRange = state.distance > 3000;
    const now = Date.now();

    if (isPlaceholder || outOfRange) {
        // Person absent / data not usable: still tell the frontend (so progress
        // can decay), but skip forwarding zeros to Max which messes with scales.
        // tooClose is preserved so frontend can distinguish "no one" from
        // "person standing right under the camera".
        atomicWriteOut(
            JSON.stringify({count: 0, distance: 0, x: 0.5, y: 0.5,
                            tooClose: state.tooClose, _bridgeTs: now}) + '\n');
        return;
    }

    forwardSocket.send(buildOSCMessage('/person/count', state.count), MAX_PORT, MAX_HOST);
    forwardSocket.send(buildOSCMessage('/person/distance', state.distance), MAX_PORT, MAX_HOST);
    forwardSocket.send(buildOSCMessage('/person/x', state.x), MAX_PORT, MAX_HOST);
    forwardSocket.send(buildOSCMessage('/person/y', state.y), MAX_PORT, MAX_HOST);

    atomicWriteOut(JSON.stringify({...state, _bridgeTs: now}) + '\n');
}

server.on('message', (msg) => {
    const parsed = parseOSCMessage(msg);
    if (!parsed) return;

    if (parsed.address === '/orbbec/person' && parsed.values.length >= 4) {
        // Combined-format frame: [count, distance_mm, center_x, center_y]
        state.count = Math.round(parsed.values[0]);
        state.distance = parsed.values[1];
        state.x = parsed.values[2];
        state.y = parsed.values[3];
        commitFrame();
    } else if (parsed.address === '/person/count') {
        state.count = Math.round(parsed.values[0]);
    } else if (parsed.address === '/person/distance') {
        state.distance = parsed.values[0];
    } else if (parsed.address === '/person/x') {
        state.x = parsed.values[0];
    } else if (parsed.address === '/person/tooClose') {
        state.tooClose = parsed.values[0] >= 0.5 ? 1 : 0;
    } else if (parsed.address === '/person/y') {
        // y is the last message in orbbec_syphon's per-frame burst; commit here.
        state.y = parsed.values[0];
        commitFrame();
    } else {
        // unrelated message: forward as-is, no state effect
        forwardSocket.send(msg, MAX_PORT, MAX_HOST);
    }
});

server.bind(PORT, () => {
    console.log(`OSC bridge listening on UDP port ${PORT}`);
    console.log(`Forwarding OSC to Max/MSP at ${MAX_HOST}:${MAX_PORT}`);
    console.log(`Writing to ${OUT_FILE}`);
    console.log('Start orbbec_syphon to send data.');
    if (NANO_SERIAL) {
        console.log(`Reading Nano button via serial ${NANO_SERIAL} → /scene OSC (override with NANO_SERIAL=...)`);
    }
});

function connectSerial() {
    if (!NANO_SERIAL) {
        // No Nano detected at startup and NANO_SERIAL not forced — disable
        // scene-switch via serial. Plug Nano in and restart, or set NANO_SERIAL=
        // explicitly to re-enable hot-plug retries. Keyboard 1-5 still works.
        console.log('No Nano 33 IoT on /dev/tty.usbmodem* — serial scene-switch disabled.');
        return;
    }
    const port = new SerialPort({ path: NANO_SERIAL, baudRate: SERIAL_BAUD }, (err) => {
        if (err) {
            console.error(`Serial open failed (${NANO_SERIAL}): ${err.message}`);
            console.log('Retrying in 3s…');
            setTimeout(connectSerial, 3000);
        }
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (line) => {
        const m = line.trim().match(/^BTN(\d)/);
        if (!m) return;
        const btn = parseInt(m[1]);
        if (btn >= 1 && btn <= 5) {
            const ts = Date.now();
            forwardSocket.send(buildOSCMessage('/scene', btn), MAX_PORT, MAX_HOST);
            fs.writeFileSync(SCENE_FILE, JSON.stringify({ btn, ts }) + '\n');
            console.log(`→ /scene ${btn}`);
        }
    });

    port.on('error', (err) => {
        console.error('Serial error:', err.message);
    });

    port.on('close', () => {
        console.log('Serial closed. Retrying in 3s…');
        setTimeout(connectSerial, 3000);
    });
}
connectSerial();
