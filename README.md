# X-Eraser

A mobile app for batch deleting Twitter/X history, built with Capacitor for Android.

## Features

- **Privacy First**: All operations are completed locally
- **Batch Cleanup**: Delete tweets, replies, and likes in one click
- **Dark Mode**: Beautiful dark theme optimized for OLED screens
- **Time Filter**: Filter content by time range

## Project Structure

```
X-Eraser/
├── index.html              # Main SPA entry point
├── injector.js             # Script to inject into x.com
├── capacitor-webview.js    # Capacitor WebView bridge
├── capacitor.config.json  # Capacitor configuration
├── package.json           # Node.js dependencies
├── android/               # Android native code
└── README.md
```

## Development Setup

### Prerequisites

- Node.js 18+
- Android Studio
- Java 17+

### Install Dependencies

```bash
npm install
```

### Add Android Platform

```bash
npx cap add android
```

### Build and Sync

```bash
npm run build    # Build web app
npx cap copy    # Copy to Android
npx cap open    # Open in Android Studio
```

### Run on Device

```bash
npm start
```

## How It Works

1. **Connect X Account**: Open X.com in the app's WebView
2. **Configure Options**: Select what to delete (tweets, replies, likes)
3. **Start Cleanup**: The injector.js script automates the deletion process

## WebView Integration

The app uses Capacitor's WebView to load x.com and inject automation scripts. The `injector.js` contains:

- Random delay logic (2-5 seconds) to avoid bot detection
- Button finding strategies for X.com's UI
- Batch processing with rest periods
- Progress tracking

## Building APK

1. Open the project in Android Studio
2. Build > Generate Signed Bundle / APK
3. Select APK and configure signing
4. Build the release APK

The APK will be in `android/app/build/outputs/apk/`

## Permissions

The app requires:
- Internet access (for loading x.com)
- Storage access (for caching)

## License

MIT
