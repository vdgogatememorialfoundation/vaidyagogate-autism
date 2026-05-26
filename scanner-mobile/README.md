# Autism Check-in Scanner — Android APK

Native Android wrapper (Capacitor) for **autism.vaidyagogate.org only**.

- Loads: `https://autism.vaidyagogate.org/scanner.html`
- **Does not** allow navigation to seminar.vaidyagogate.org or other portals
- App id: `org.vaidyagogate.autism.scanner` (separate from the VGMF seminar scanner APK)

## Prerequisites

- Node.js 20+
- [Android Studio](https://developer.android.com/studio) with Android SDK
- JDK 17

## Build (Windows)

From repo root:

```powershell
.\scripts\build-autism-scanner-apk.ps1
```

Output:

- `Autism-Scanner-debug.apk` (repo root)
- `public\downloads\autism-scanner.apk` (for website download)

Staff download page: **https://autism.vaidyagogate.org/scanner-download.html**

## Setup (once)

```bash
cd scanner-mobile
npm install
```

## Manual build

```powershell
node scripts/sync-mobile-capacitor.js --scanner-only
cd scanner-mobile
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

APK: `scanner-mobile/android/app/build/outputs/apk/debug/app-debug.apk`

## Staff accounts

Create **Scanner (volunteer)** users in Admin → Staff users. Enable **check-in** on the event before scanning.

## Notes

- HTTPS required in production (`cleartext: false`).
- After changing `capacitor.config.json`, run sync and rebuild.
- The web app verifies `productId: autism` on load; wrong hosts are blocked in the native shell.
