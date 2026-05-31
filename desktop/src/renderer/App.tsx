import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type DeviceInfo = {
  serial: string;
  model?: string;
  androidVersion?: string;
  status?: string;
};

type TestResult = {
  testId: string;
  name: string;
  status: string;
  duration?: number;
  metrics?: Record<string, any>;
};

type DiagnosticSession = {
  sessionId: string;
  device: DeviceInfo;
  startedAt: string;
  completedAt?: string;
  results: TestResult[];
};

const PANEL_STYLE = 'panel glass';

function LeftPanel({
  devices,
  selectedSerial,
  onSelect,
  statusLabel
}: {
  devices: DeviceInfo[];
  selectedSerial: string | null;
  onSelect: (serial: string) => void;
  statusLabel: string;
}) {
  return (
    <motion.div
      className={PANEL_STYLE}
      style={{ width: 320, height: '100%', overflowY: 'auto' }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h3 className="panel-title">Connected Devices</h3>
      <div className="status-pill">{statusLabel}</div>
      <div className="device-list">
        {devices.length === 0 ? (
          <div className="device-card disabled">
            <div className="device-name">No devices</div>
            <div className="device-serial">Connect via USB with ADB</div>
          </div>
        ) : (
          devices.map((device) => (
            <motion.button
              key={device.serial}
              type="button"
              className={`device-card ${device.serial === selectedSerial ? 'selected' : ''}`}
              onClick={() => onSelect(device.serial)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="device-name">{device.model || 'Android Device'}</div>
              <div className="device-serial">{device.serial.substr(0, 12)}</div>
              <div className="device-info">{device.androidVersion}</div>
            </motion.button>
          ))
        )}
      </div>
    </motion.div>
  );
}

/* (App.tsx content repeated - included for safety) */

export default function App() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [statusText, setStatusText] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [lastSession, setLastSession] = useState<DiagnosticSession | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.serial === selectedSerial) || devices[0] || null,
    [devices, selectedSerial]
  );

  useEffect(() => {
    if (!selectedSerial && devices.length > 0) {
      setSelectedSerial(devices[0].serial);
    }
  }, [devices, selectedSerial]);

  function connectWebSocket() {
    const socket = new WebSocket('ws://127.0.0.1:8080');
    wsRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus('connected');
      log('✓ WebSocket connected to MCS server');
      socket.send(JSON.stringify({ type: 'ping' }));

      // Request device list
      socket.send(JSON.stringify({ type: 'get-devices' }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'devices') {
          setDevices((current) => {
            const merged = msg.devices.map((serial: string) => {
              const existing = current.find((device) => device.serial === serial);
              return existing || { serial, model: `Device ${serial.substr(0, 6)}` };
            });
            return merged.length > 0 ? merged : current;
          });
        }

        if (msg.type === 'device-info') {
          setDevices((current) => {
            const existingIndex = current.findIndex((device) => device.serial === msg.info.serial);
            if (existingIndex >= 0) {
              const next = [...current];
              next[existingIndex] = { ...next[existingIndex], ...msg.info };
              return next;
            }
            return [...current, msg.info];
          });
        }

        if (msg.type === 'diagnostic-session-start') {
          log('→ Diagnostic session started');
          setProgress(5);
        }

        if (msg.type === 'diagnostic-progress') {
          log(`  ${msg.message}`);
          const currentProgress = progress + Math.random() * 15;
          setProgress(Math.min(currentProgress, 95));
        }

        if (msg.type === 'diagnostic-complete') {
          setProgress(100);
          setStatusText('✓ Diagnostic complete');
          setRunning(false);
          log(`✓ Session completed: ${msg.session.sessionId}`);
          setLastSession(msg.session);

          setTimeout(() => {
            setProgress(0);
            setStatusText('Idle');
          }, 2000);
        }

        if (msg.type === 'diagnostic-error') {
          setStatusText('✗ Diagnostic error');
          setRunning(false);
          log(`✗ Error: ${msg.error}`);
          setProgress(0);
        }
      } catch (error) {
        log(`⚠ Malformed message`);
      }
    };

    socket.onclose = () => {
      setConnectionStatus('disconnected');
      log('✗ Server disconnected, reconnecting...');
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };

    socket.onerror = () => {
      setConnectionStatus('error');
      log('✗ Connection error');
    };
  }

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  function log(message: string) {
    const entry = `${new Date().toLocaleTimeString()} • ${message}`;
    setLogs((previous) => [entry, ...previous].slice(0, 100));
  }

  function startDiagnostic() {
    if (running || !selectedDevice) return;
    setRunning(true);
    setProgress(0);
    setStatusText('Preparing diagnostic...');
    log(`→ Starting diagnostic for ${selectedDevice.model || selectedDevice.serial}`);

    if (connectionStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start-diagnostic', device: selectedDevice }));
    } else {
      log('✗ Server not connected');
      setRunning(false);
    }
  }

  return (
    <div className="app-container">
      <motion.div
        className="app-topbar"
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="brand">
          <div className="app-title">⚙️ MCS - DIAGNOSTICS ENTERPRISE</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
          <motion.div
            className={`connection-status ${connectionStatus}`}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <span className="status-dot" />
            {connectionStatus}
          </motion.div>
        </div>
      </motion.div>

      <div className="app-root">
        <LeftPanel
          devices={devices}
          selectedSerial={selectedSerial}
          onSelect={setSelectedSerial}
          statusLabel={connectionStatus === 'connected' ? '● Live scan' : '○ Offline mode'}
        />
        <CenterPanel
          onStart={startDiagnostic}
          running={running}
          status={statusText}
          selectedDevice={selectedDevice}
          progress={progress}
        />
        <RightPanel logs={logs} session={lastSession} />
      </div>
    </div>
  );
}
