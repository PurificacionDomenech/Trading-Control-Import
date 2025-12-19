# Trading Control PWA

## Overview
This is a Progressive Web App (PWA) for trading control and tracking. It's a client-side only application built with vanilla HTML, CSS, and JavaScript that helps traders:
- Track their trading operations
- Monitor account balance and performance
- Maintain a trading checklist
- Set and track weekly challenges (Retos Semanales)
- Record trading goals and objectives
- View operation history and statistics

## Project Architecture

### Tech Stack
- **Frontend**: Pure HTML, CSS, JavaScript (no framework)
- **PWA Features**: Service Worker for offline capabilities, Web App Manifest
- **Charts**: Chart.js for data visualization
- **Storage**: LocalStorage for client-side data persistence

### File Structure
- `index.html` - Main application file (contains all HTML, CSS, and JavaScript)
- `manifest.json` - PWA manifest for installability
- `sw.js` - Service worker for offline functionality
- `logo.jpg` - Application logo
- `icon.png` - Application icon
- `server.py` - Development server (Python HTTP server)

## Development Setup

### Running Locally
The application runs on a Python HTTP server on port 5000:
```bash
python server.py
```

The server is configured to:
- Bind to `0.0.0.0:5000` for Replit environment compatibility
- Disable caching to ensure updates are visible immediately
- Serve all static files from the root directory

### Workflow
- **Name**: Start application
- **Command**: `python server.py`
- **Port**: 5000
- **Type**: Webview (frontend application)

## Deployment

### Configuration
- **Type**: Static site deployment
- **Public Directory**: `.` (root directory)
- **No build step required** - all files are served as-is

The application is ready to deploy as a static site since it has no backend dependencies.

## Features

### Main Tabs
1. **Dashboard** - Account summary, balance, and drawdown tracking
2. **Checklist** - Daily trading checklist
3. **Registro** - Trade operation logging
4. **Historial** - Trading history and analytics
5. **Objetivos** - Goals and objectives tracking
6. **Retos Semanales** - Weekly trading challenges

### Data Storage
All data is stored in the browser's LocalStorage, making the app fully functional offline after the initial load.

## Recent Changes
- 2025-12-07: Initial setup for Replit environment
  - Created Python HTTP server for development
  - Configured workflow for port 5000 with webview
  - Set up static site deployment configuration
  - Verified PWA loads correctly with service worker registered

## Notes
- This is a client-side only application with no backend
- All data persists in the browser's LocalStorage
- The service worker enables offline functionality
- No database or external APIs required
