/**
 * UniPet Overlay - Electron main process.
 *
 * Creates a transparent always-on-top window, connects to the UniPet bridge
 * via WebSocket, and forwards pet events to the renderer.
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PROTOCOL_VERSION, PetStore, normalizeEvent } = require('./core');

// Safe console for background mode (EPIPE guard)
const log = (...args) => { try { console.log(...args); } catch (_) {} };
const warn = (...args) => { try { console.warn(...args); } catch (_) {} };

// ---- Config ----
const BRIDGE_HOST = process.env.UNIPET_HOST || '127.0.0.1';
const BRIDGE_PORT = process.env.UNIPET_PORT || 8768;
const BRIDGE_WS_PORT = process.env.UNIPET_WS_PORT || 8769;
const WS_URL = process.env.UNIPET_WS_URL || `ws://${BRIDGE_HOST}:${BRIDGE_WS_PORT}/ws`;
const WINDOW_SIZE = { width: 300, height: 340 };
const PET_TITLE = `UniPet Overlay [${process.pid}]`;

let win = null;
let wsClient = null;
let reconnectTimer = null;
let reconnectDelayMs = 1000;
const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
let bridgeConnected = false;
let dragState = null;
let httpServer = null;
let wsServer = null;
let bridgeStore = null;
let lastBroadcast = '';

// ---- Position persistence ----
function positionFilePath() {
    const dir = process.env.UNIPET_HOME || path.join(os.homedir(), '.unipet');
    return path.join(dir, 'window_position.json');
}

function defaultPosition() {
    const area = screen.getPrimaryDisplay().workArea;
    return {
        x: area.x + area.width - WINDOW_SIZE.width - 20,
        y: area.y + area.height - WINDOW_SIZE.height - 100,
    };
}

function loadPosition() {
    try {
        const f = positionFilePath();
        if (fs.existsSync(f)) {
            return JSON.parse(fs.readFileSync(f, 'utf8'));
        }
    } catch (_) {}
    return defaultPosition();
}

function savePosition(x, y) {
    try {
        const f = positionFilePath();
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify({ x, y }));
    } catch (_) {}
}

// ---- Runtime file ----
function unipetHome() {
    return process.env.UNIPET_HOME || path.join(os.homedir(), '.unipet');
}

function runtimeFilePath() {
    return path.join(unipetHome(), 'runtime', 'pet_runtime.json');
}

function writeRuntime() {
    const runtimePath = runtimeFilePath();
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(runtimePath, JSON.stringify({
        pid: process.pid,
        overlay_pid: process.pid,
        host: BRIDGE_HOST,
        port: Number(BRIDGE_PORT),
        ws_port: Number(BRIDGE_WS_PORT),
        url: `http://${BRIDGE_HOST}:${BRIDGE_PORT}/api/pet/view`,
        ws_url: WS_URL,
        runtime: 'node-electron',
        updated_at: Date.now() / 1000,
    }, null, 2));
}

function removeRuntime() {
    try {
        const runtimePath = runtimeFilePath();
        const data = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
        if (data.pid === process.pid) fs.rmSync(runtimePath, { force: true });
    } catch (_) {}
}

// ---- Local bridge ----
function sendJson(res, status, data) {
    const body = Buffer.from(JSON.stringify(data), 'utf8');
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    res.end(body);
}

function readRequestJson(req, callback) {
    let raw = '';
    req.on('data', (chunk) => {
        raw += chunk;
        if (Buffer.byteLength(raw, 'utf8') > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
        try {
            callback(null, JSON.parse(raw || '{}'));
        } catch (err) {
            callback(err);
        }
    });
}

function bridgeView() {
    return {
        protocol: PROTOCOL_VERSION,
        pets: bridgeStore.snapshot(),
        active_pet: bridgeStore.activePet(),
        active_state: bridgeStore.activeState(),
    };
}

function broadcastState(force = false) {
    if (!wsServer) return;
    const payload = JSON.stringify({ type: 'state_update', ...bridgeView() });
    if (!force && payload === lastBroadcast) return;
    lastBroadcast = payload;
    for (const client of wsServer.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
}

function startBridge() {
    if (httpServer || wsServer) return;
    bridgeStore = new PetStore();
    const startedAt = Date.now();

    httpServer = http.createServer((req, res) => {
        if (req.method === 'OPTIONS') {
            sendJson(res, 204, {});
            return;
        }
        const url = new URL(req.url || '/', `http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
            sendJson(res, 200, {
                status: 'ok',
                pid: process.pid,
                uptime: (Date.now() - startedAt) / 1000,
                protocol: PROTOCOL_VERSION,
                ws_url: WS_URL,
                runtime: 'node-electron',
            });
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/pet/view') {
            sendJson(res, 200, bridgeView());
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/pet/events') {
            readRequestJson(req, (err, payload) => {
                if (err) {
                    sendJson(res, 400, { error: `invalid json: ${err.message}` });
                    return;
                }
                try {
                    const event = normalizeEvent(payload);
                    bridgeStore.apply(event);
                    const view = bridgeView();
                    sendJson(res, 200, { status: 'ok', ...view });
                    broadcastState(true);
                } catch (eventErr) {
                    sendJson(res, 400, { error: eventErr.message });
                }
            });
            return;
        }
        sendJson(res, 404, { error: 'not found' });
    });

    httpServer.listen(Number(BRIDGE_PORT), BRIDGE_HOST, () => {
        log(`[unipet] HTTP bridge listening on http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
    });

    wsServer = new WebSocket.Server({ host: BRIDGE_HOST, port: Number(BRIDGE_WS_PORT), path: '/ws' });
    wsServer.on('connection', (socket) => {
        socket.send(JSON.stringify({ type: 'state_update', ...bridgeView() }));
        socket.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong', ...bridgeView() }));
            } catch (_) {}
        });
    });
    wsServer.on('listening', () => {
        log(`[unipet] WebSocket bridge listening on ${WS_URL}`);
    });

    writeRuntime();
    setInterval(() => broadcastState(false), 1000);
}

function stopBridge() {
    removeRuntime();
    if (wsServer) {
        try { wsServer.close(); } catch (_) {}
        wsServer = null;
    }
    if (httpServer) {
        try { httpServer.close(); } catch (_) {}
        httpServer = null;
    }
}

// ---- WebSocket connection ----
function notifyBridgeConnected(connected) {
    if (bridgeConnected === connected) return;
    bridgeConnected = connected;
    if (win) win.webContents.send('bridge-connected', connected);
}

function connectBridge() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    notifyBridgeConnected(false);

    try {
        wsClient = new WebSocket(WS_URL);
    } catch (err) {
        warn('[unipet] ws creation failed:', err.message);
        scheduleReconnect();
        return;
    }

    wsClient.on('open', () => {
        reconnectDelayMs = MIN_RECONNECT_MS;
        log('[unipet] connected to bridge');
        notifyBridgeConnected(true);
    });

    wsClient.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (win) win.webContents.send('pet-event', msg);
        } catch (_) {}
    });

    wsClient.on('close', () => {
        notifyBridgeConnected(false);
        scheduleReconnect();
    });

    wsClient.on('error', () => {
        // Ignore (reconnect handles it)
    });
}

function scheduleReconnect() {
    if (app.isQuitting) return;
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_MS);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectBridge, delay);
}

// ---- Window ----
function createWindow() {
    if (win) return;
    const pos = loadPosition();

    win = new BrowserWindow({
        ...WINDOW_SIZE,
        x: pos.x,
        y: pos.y,
        title: PET_TITLE,
        transparent: true,
        frame: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: false,
        hasShadow: false,
        resizable: false,
        backgroundColor: '#00000000',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadFile(path.join(__dirname, 'index.html'));

    win.once('ready-to-show', () => {
        win.showInactive();
        try { win.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {}
    });

    let moveTimeout = null;
    win.on('move', () => {
        if (dragState) return;
        if (moveTimeout) clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => {
            const bounds = win.getBounds();
            savePosition(bounds.x, bounds.y);
        }, 500);
    });

    win.on('closed', () => { dragState = null; win = null; });
}

// ---- Drag handling ----
ipcMain.on('pet-drag-start', (_, point) => {
    if (!win) return;
    dragState = { startX: point.screenX, startY: point.screenY, bounds: win.getBounds() };
});

ipcMain.on('pet-drag-move', (_, point) => {
    if (!win || !dragState) return;
    const dx = Math.round(point.screenX - dragState.startX);
    const dy = Math.round(point.screenY - dragState.startY);
    win.setPosition(dragState.bounds.x + dx, dragState.bounds.y + dy, false);
});

ipcMain.on('pet-drag-end', () => {
    if (!win) return;
    dragState = null;
    const bounds = win.getBounds();
    savePosition(bounds.x, bounds.y);
});

// ---- Quit ----
ipcMain.on('pet-quit', () => {
    app.isQuitting = true;
    if (wsClient) wsClient.close();
    app.quit();
});

// ---- App lifecycle ----
app.whenReady().then(() => { startBridge(); createWindow(); connectBridge(); });
app.on('window-all-closed', () => {
    app.isQuitting = true;
    if (wsClient) wsClient.close();
    stopBridge();
    app.quit();
});
app.on('before-quit', () => {
    app.isQuitting = true;
    if (wsClient) wsClient.close();
    stopBridge();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
