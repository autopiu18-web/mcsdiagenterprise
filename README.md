# MCS - DIAGNOSTICS ENTERPRISE

Professional Android GSM diagnostic tool for service/repair centers.

**Status:** ✅ Production-Ready  
**Version:** 1.0.0

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Run desktop app (development)
cd desktop && pnpm dev

# Build Windows .exe installer
cd desktop && pnpm dist
```

## 📚 Full Documentation

See [README-FULL.md](./README-FULL.md) for complete documentation.

## 📁 Monorepo Structure

- `desktop` — Electron + React + TypeScript (WebSocket server, ADB integration, PDF generator)
- `android-companion` — Kotlin Android app (hardware diagnostics, WebSocket client)
- `shared` — TypeScript types and protocol definitions

## 🏗️ Features

✅ Windows .exe installer  
✅ Android companion app with real hardware tests  
✅ WebSocket bridge (localhost only)  
✅ ADB device auto-detection  
✅ Premium dark UI with animations  
✅ PDF report generation  
✅ Fully offline operation  

## ⚙️ Tech Stack

- **Desktop:** Electron 26, React 18, TypeScript, Vite
- **Android:** Kotlin, AndroidX, CameraX
- **Communication:** WebSocket (ws), ADB
- **Build:** electron-builder (Windows), Gradle (Android)

## 📝 Commands

```bash
# Development
pnpm --filter desktop dev        # Run desktop with hot reload
pnpm --filter shared build       # Build shared types
pnpm --filter android-companion build  # Build Android APK

# Production
pnpm --filter desktop dist       # Build Windows .exe
pnpm --filter desktop dist:portable  # Build portable .exe
```

---

**Getting Started:** `pnpm install && cd desktop && pnpm dev`
