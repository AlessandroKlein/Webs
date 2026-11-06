// electron/preload.cjs — Preload seguro (CommonJS a propósito).
//
// Con sandbox:true el preload NO puede ser ESM (limitación de Electron), por
// eso usa extensión .cjs aunque el resto del paquete sea "type": "module".
// Expone al renderer una API mínima y tipada vía contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('websDesktop', {
  /** Versión del puente/companion (Promise<string>). */
  version: () => ipcRenderer.invoke('webs:version'),

  /**
   * Suscribe a lecturas de código (serial) reenviadas por el main vía IPC.
   * Devuelve una función para cancelar la suscripción.
   * @param {(payload: {code:string, source:string, at:string}) => void} cb
   * @returns {() => void}
   */
  onScan: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('webs:scan', listener);
    return () => ipcRenderer.removeListener('webs:scan', listener);
  },
});
