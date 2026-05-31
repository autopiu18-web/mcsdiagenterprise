import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  generatePdf: (data: any) => ipcRenderer.invoke('generate-pdf', data),
  exportSession: (data: any) => ipcRenderer.invoke('export-session', data)
});

contextBridge.exposeInMainWorld('mcs', {
  generatePdf: (data: any) => ipcRenderer.invoke('generate-pdf', data),
  exportSession: (data: any) => ipcRenderer.invoke('export-session', data)
});
