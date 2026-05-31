import WebSocket from 'ws';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { BrowserWindow } from 'electron';

const execAsync = promisify(exec);

const PORT = 8080;
let wsServer: WebSocket.Server | null = null;
let httpServer: http.Server | null = null;
let clients: Map<string, WebSocket> = new Map();
let diagnosticInProgress = false;

// ============================================================================
// ADB Integration
// ============================================================================

export async function execADB(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(`adb ${args.join(' ')}`);
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    return { stdout: '', stderr: error.message };
  }
}

export async function getConnectedDevices(): Promise<string[]> {
  try {
    const result = await execADB(['devices']);
    const lines = result.stdout.split('\n').slice(1);
    return lines
      .filter((line: string) => line.includes('device') && !line.includes('offline'))
      .map((line: string) => line.split('\t')[0])
      .filter((serial: string) => serial.length > 0);
  } catch {
    return [];
  }
}

export async function getDeviceInfo(serial: string) {
  try {
    const commands = [
      ['shell', 'getprop', 'ro.product.model'],
      ['shell', 'getprop', 'ro.build.version.release'],
      ['shell', 'getprop', 'ro.build.fingerprint'],
      ['shell', 'getprop', 'ro.product.manufacturer'],
      ['shell', 'getprop', 'ro.product.brand']
    ];

    const model = await execADB(['-s', serial, ...commands[0]]);
    const androidVersion = await execADB(['-s', serial, ...commands[1]]);
    const build = await execADB(['-s', serial, ...commands[2]]);
    const manufacturer = await execADB(['-s', serial, ...commands[3]]);
    const brand = await execADB(['-s', serial, ...commands[4]]);

    return {
      serial,
      model: model.stdout || 'Unknown',
      androidVersion: androidVersion.stdout || 'Unknown',
      buildNumber: build.stdout.split('/')[3] || 'Unknown',
      manufacturer: manufacturer.stdout || 'Unknown',
      brand: brand.stdout || 'Unknown'
    };
  } catch (error) {
    console.error('Error getting device info:', error);
    return { serial, model: 'Unknown', androidVersion: 'Unknown' };
  }
}

export async function setupWebSocketBridge(serial: string): Promise<boolean> {
  try {
    // adb reverse tcp:8080 tcp:8080
    await execADB(['-s', serial, 'reverse', 'tcp:8080', 'tcp:8080']);
    return true;
  } catch (error) {
    console.error('Error setting up reverse tunnel:', error);
    return false;
  }
}

// ============================================================================
// WebSocket Server
// ============================================================================

function broadcast(message: any) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function sendToClient(clientId: string, message: any) {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

async function pollDevices() {
  setInterval(async () => {
    try {
      const devices = await getConnectedDevices();
      broadcast({ type: 'devices', devices });

      for (const serial of devices) {
        const info = await getDeviceInfo(serial);
        broadcast({ type: 'device-info', info });
      }
    } catch (error) {
      console.error('Error polling devices:', error);
    }
  }, 5000);
}

async function runDiagnosticSession(deviceSerial: string, clientId: string) {
  if (diagnosticInProgress) {
    sendToClient(clientId, {
      type: 'diagnostic-error',
      error: 'Another diagnostic is already running',
      device: deviceSerial
    });
    return;
  }

  diagnosticInProgress = true;
  const sessionId = `${deviceSerial}-${Date.now()}`;

  try {
    // Get device info
    const deviceInfo = await getDeviceInfo(deviceSerial);

    // Notify start
    broadcast({
      type: 'diagnostic-session-start',
      sessionId,
      device: deviceInfo
    });

    // Setup WebSocket bridge
    const bridgeReady = await setupWebSocketBridge(deviceSerial);

    if (!bridgeReady) {
      throw new Error('Failed to setup WebSocket bridge');
    }

    // Wait for companion app to connect (timeout: 30s)
    let companionConnected = false;
    let attempts = 0;
    while (!companionConnected && attempts < 30) {
      // Check if companion would connect - in real scenario, it would be via WebSocket
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }

    // Simulate running tests
    const tests = [
      { id: 'camera_front', name: 'Front Camera', timeout: 5000 },
      { id: 'camera_rear', name: 'Rear Camera', timeout: 5000 },
      { id: 'microphone', name: 'Microphone', timeout: 5000 },
      { id: 'speaker', name: 'Speaker', timeout: 5000 },
      { id: 'vibrator', name: 'Vibration Motor', timeout: 3000 },
      { id: 'touchscreen', name: 'Touchscreen', timeout: 10000 },
      { id: 'sensors', name: 'Sensors (Accel, Gyro, Compass)', timeout: 5000 },
      { id: 'connectivity', name: 'Connectivity (WiFi, BT, GPS)', timeout: 5000 }
    ];

    const results = [];
    for (const test of tests) {
      broadcast({
        type: 'diagnostic-progress',
        message: `Running ${test.name}...`,
        sessionId
      });

      // In a real scenario, this would wait for the companion app to report results
      await new Promise(r => setTimeout(r, 1500));

      const status = Math.random() > 0.1 ? 'PASS' : 'FAIL';
      results.push({
        testId: test.id,
        name: test.name,
        status,
        duration: Math.floor(Math.random() * 3000) + 1000
      });

      broadcast({
        type: 'diagnostic-progress',
        message: `${test.name}: ${status}`,
        sessionId
      });
    }

    // Complete
    broadcast({
      type: 'diagnostic-complete',
      session: {
        sessionId,
        device: deviceInfo,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        results,
        duration: results.reduce((sum, r) => sum + (r.duration || 0), 0)
      }
    });

  } catch (error) {
    broadcast({
      type: 'diagnostic-error',
      error: (error as Error).message,
      device: deviceSerial,
      sessionId
    });
  } finally {
    diagnosticInProgress = false;
  }
}

export function startWSServer() {
  httpServer = http.createServer();
  wsServer = new WebSocket.Server({ server: httpServer });

  wsServer.on('connection', (ws, req) => {
    const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    clients.set(clientId, ws);

    console.log(`[WS] Client connected: ${clientId}`);

    // Send initial connection message
    ws.send(
      JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString()
      })
    );

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data);

        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }

        if (message.type === 'get-devices') {
          const devices = await getConnectedDevices();
          ws.send(JSON.stringify({ type: 'devices', devices }));
        }

        if (message.type === 'start-diagnostic') {
          const deviceSerial = message.device?.serial;
          if (!deviceSerial) {
            ws.send(
              JSON.stringify({
                type: 'diagnostic-error',
                error: 'No device specified'
              })
            );
            return;
          }

          // Run diagnostic in background
          runDiagnosticSession(deviceSerial, clientId).catch(console.error);
        }
      } catch (error) {
        console.error('[WS] Message parsing error:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`[WS] Client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      console.error(`[WS] Client error (${clientId}):`, error);
    });
  });

  // Start polling devices
  pollDevices();

  httpServer.listen(PORT, '127.0.0.1', () => {
    console.log(`[WS] Server running on ws://127.0.0.1:${PORT}`);
  });
}

export function stopWSServer() {
  if (wsServer) {
    wsServer.close();
    wsServer = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  clients.clear();
  console.log('[WS] Server stopped');
}
