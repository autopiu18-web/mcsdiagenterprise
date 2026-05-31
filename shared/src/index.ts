// Test execution status
export type TestStatus = 'PASS' | 'FAIL' | 'NOT_AVAILABLE' | 'MANUAL_CHECK' | 'PENDING' | 'SKIPPED';

// Individual test result
export interface TestResult {
  testId: string;
  name: string;
  category: string;
  status: TestStatus;
  message?: string;
  metrics?: Record<string, number | string>;
  duration?: number;
}

// Device information from ADB
export interface DeviceInfo {
  serial: string;
  model?: string;
  androidVersion?: string;
  buildNumber?: string;
  manufacturer?: string;
  device?: string;
  brand?: string;
}

// WebSocket message types
export type WSMessageType = 
  | 'ping' 
  | 'pong'
  | 'get-devices'
  | 'devices'
  | 'device-info'
  | 'start-diagnostic'
  | 'diagnostic-session-start'
  | 'diagnostic-progress'
  | 'diagnostic-complete'
  | 'diagnostic-error'
  | 'test-result'
  | 'session-list'
  | 'session-data';

// Base WebSocket message
export interface WSMessage {
  type: WSMessageType;
  timestamp?: string;
  [key: string]: any;
}

// Diagnostic result tracking
export interface DiagnosticSession {
  sessionId: string;
  device: DeviceInfo;
  startedAt: string;
  completedAt?: string;
  results: TestResult[];
  duration?: number;
  technician?: string;
  notes?: string;
}

// Diagnostic test configuration
export interface DiagnosticTest {
  id: string;
  name: string;
  category: 'camera' | 'audio' | 'hardware' | 'sensor' | 'connectivity' | 'display' | 'system';
  type: 'adb_only' | 'companion_required' | 'both';
  enabled: boolean;
  timeout?: number;
  priority?: 'high' | 'normal' | 'low';
}

// Android companion message
export interface CompanionMessage {
  deviceId: string;
  test: string;
  status: TestStatus;
  metrics?: Record<string, number | string>;
  timestamp?: string;
}

// ADB command response
export interface ADBResponse {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

// Error response
export interface ErrorMessage extends WSMessage {
  type: 'diagnostic-error';
  error: string;
  code?: string;
  device?: string;
}
