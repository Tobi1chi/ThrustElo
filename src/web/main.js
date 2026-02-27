import { createWebIpcRenderer } from './ipc-renderer-web.js';
import '../renderer/assets/main.css';

if (!window.ipcRenderer) {
  window.ipcRenderer = createWebIpcRenderer();
}

await import('../renderer/renderer.js');
