/**
 * UniPet Overlay — Electron main process.
 *
 * Creates a transparent always-on-top window, connects to the UniPet bridge
 * via WebSocket, and forwards pet events to the renderer.
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
app.whenReady().then(() => { createWindow(); connectBridge(); });
app.on('window-all-closed', () => {
    app.isQuitting = true;
    if (wsClient) wsClient.close();
    app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
