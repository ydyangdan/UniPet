/**
 * UniPet Overlay - preload script (context isolation bridge).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('unipetAPI', {
    // Bridge connection status
    onBridgeConnected: (callback) =>
        ipcRenderer.on('bridge-connected', (_, connected) => callback(connected)),

    // Pet events from bridge
    onPetEvent: (callback) =>
        ipcRenderer.on('pet-event', (_, event) => callback(event)),

    // Drag IPC
    petDragStart: (point) => ipcRenderer.send('pet-drag-start', point),
    petDragMove: (point) => ipcRenderer.send('pet-drag-move', point),
    petDragEnd: () => ipcRenderer.send('pet-drag-end'),

    // Quit
    petQuit: () => ipcRenderer.send('pet-quit'),
});
