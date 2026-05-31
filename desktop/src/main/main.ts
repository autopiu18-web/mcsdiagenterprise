import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { generateReport } from './pdfGenerator';
import { startWSServer, stopWSServer } from './websocketServer';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico')
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // Start WebSocket server on port 8080
  startWSServer();
  createWindow();
});

app.on('window-all-closed', () => {
  stopWSServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC: Generate PDF report
ipcMain.handle('generate-pdf', async (event, sessionData) => {
  try {
    const documentsDir = app.getPath('documents');
    const fileName = `MCS-Report-${sessionData.sessionId || Date.now()}.pdf`;
    const filePath = path.join(documentsDir, fileName);
    await generateReport(filePath, sessionData);
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Export session as JSON
ipcMain.handle('export-session', async (event, sessionData) => {
  try {
    const documentsDir = app.getPath('documents');
    const fileName = `MCS-Session-${sessionData.sessionId || Date.now()}.json`;
    const filePath = path.join(documentsDir, fileName);
    await require('fs').promises.writeFile(filePath, JSON.stringify(sessionData, null, 2));
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  stopWSServer();
  app.quit();
});

export { mainWindow };
