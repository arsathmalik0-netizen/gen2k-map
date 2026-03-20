# Gen2K Marketing Console

A high-performance Electron application built for managing multiple WhatsApp Web sessions simultaneously. Features a sleek, dark-themed dashboard for campaign management and real-time activity monitoring.

## 🚀 Key Features

- **Multi-Session Management**: Run and monitor 10+ independent WhatsApp sessions.
- **Background Operations**: Sessions automatically transition to background mode after secure QR login.
- **Campaign Engine**: Create and run messaging campaigns with custom templates and contact lists.
- **Isolated Instances**: Each session is completely isolated with its own browser profile and storage.
- **Real-Time Logging**: Enhanced logging system with crash recovery and circular dependency protection.

## 📁 Getting Started

For a quick setup guide, see [QUICK_START.md](QUICK_START.md).

### Installation

```bash
npm install
```

### Development

```bash
npm run compile
npm start
```

### Build for Production

```bash
# Compile TypeScript
npm run compile

# Create standalone package
npm run build
```

## 📖 Documentation

Detailed information about the architecture and implementation can be found in [DOCUMENTATION.md](DOCUMENTATION.md).

## 🛠️ Tech Stack

- **Framework**: Electron
- **Language**: TypeScript
- **UI**: Vanilla HTML/CSS/JS (Legacy Renderer)
- **Storage**: Local filesystem-based JSON storage
- **Packaging**: Electron Forge

## ⚖️ License

MIT License
