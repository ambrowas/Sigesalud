# Sigesalud

Electron + Vite desktop demo for health operations dashboards.

## Requirements
- Node.js and npm

## Setup
```bash
npm install
```

## Development
```bash
npm run dev
```

## Build
```bash
npm run build
npm run start
```

## Web build (static)
```bash
npm run build
```

The static renderer output is in `dist/renderer`. When running in a browser,
the app uses a local fallback API with demo data (see `src/renderer/web-api.ts`).

## Firebase Hosting
```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting
```

## Data
- Demo database: `sigesalud-demo.sqlite`.
- If the file is missing, the app creates an empty schema on first run.
- Optional: regenerate demo data with `npm run seed` and `npm run seed:hr`.
