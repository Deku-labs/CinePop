# CinePop — Capacitor Android wrapper (phone + tablet + TV)

This folder turns the CinePop into a native Android `.apk` / `.aab` that
runs on phones, tablets, **and Android TV** (Leanback launcher), using a
minimal Capacitor setup.

## Prerequisites

- **Node.js 18+**
- **Java 17** (`brew install --cask temurin@17` on macOS)
- **Android Studio** (latest) — used once to build the APK
- **(Optional) ANDROID_HOME** env var pointing to your Android SDK

## First-time setup

```bash
cd CinePop/android-capacitor

# 1. install Capacitor deps
npm install

# 2. generate the native android/ project
npx cap add android

# 3. apply the TV-friendly AndroidManifest
cp android-overrides/AndroidManifest.xml android/app/src/main/AndroidManifest.xml

# 4. copy app icons + TV banner from the PWA folder
mkdir -p android/app/src/main/res/{mipmap-hdpi,mipmap-xhdpi,mipmap-xxhdpi,mipmap-xxxhdpi,drawable}
cp ../icons/icon-192.png android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
cp ../icons/icon-192.png android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
cp ../icons/icon-512.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
cp ../icons/icon-512.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
# TV banner (must be exactly 320x180; reuse the 512 icon, Android will scale)
cp ../icons/icon-512.png android/app/src/main/res/drawable/banner.png

# 5. sync — Capacitor copies your config + plugins into the android/ project
npx cap sync
```

## Point it at your live site

Edit `capacitor.config.json` and replace the placeholder URL:

```json
"server": {
  "url": "https://YOUR-DEPLOY.pages.dev",
  ...
}
```

The app loads the URL at startup, so you get web-side updates for free —
no rebuild needed when you change the PWA.

> **Want a 100% offline build instead?** Delete the entire `"server"` block.
> Capacitor will then bundle the contents of `src/` as the app's web view.
> You'd need to copy the PWA files into `src/` first
> (`cp -r ../app.js ../index.html ../sw.js ../manifest.webmanifest ../icons src/`).

## Build the APK

### Easy way (Android Studio GUI)
```bash
npx cap open android
```
Android Studio opens → **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

### CLI
```bash
npm run build:debug                      # debug APK (sideloadable)
npm run build:release                    # release APK (needs signing)
npm run bundle:release                   # .aab for Play Store
```

For a **release build** you need a signing key. One-time setup:

```bash
keytool -genkey -v -keystore playimdb.keystore \
  -alias playimdb -keyalg RSA -keysize 2048 -validity 10000
```

Then add to `android/app/build.gradle`:

```groovy
android {
  signingConfigs {
    release {
      storeFile file('../../playimdb.keystore')
      storePassword 'YOUR_PASS'
      keyAlias     'playimdb'
      keyPassword  'YOUR_PASS'
    }
  }
  buildTypes {
    release { signingConfig signingConfigs.release }
  }
}
```

## Installing

### Phone / tablet
1. Copy the APK to the device (USB, email, Drive)
2. Enable **Install from unknown sources** for your file manager
3. Tap the APK

Or via ADB:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Android TV / Google TV / Fire TV
1. TV → Settings → Device → About → tap **Build** 7× to enable developer mode
2. Settings → Developer options → enable **USB debugging** & **Apps from unknown sources**
3. Find the TV's IP (Settings → Network)
4. From your laptop:
   ```bash
   adb connect <tv-ip>:5555
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```
5. The app appears on the TV home screen (Leanback row) with the banner

Alternative for non-techie TV install: use the **"Send Files to TV"** app
on Play Store to push the APK from your phone.

## What's already configured

- ✅ Phone, tablet, **and Android TV** launcher entries
- ✅ D-pad / remote navigation (Android WebView handles focus automatically)
- ✅ Fullscreen / immersive on TV
- ✅ Status bar styled to match the PWA's dark theme
- ✅ Splash screen with brand color
- ✅ App icon + 320×180 TV banner
- ✅ Deep links from `https://YOUR-DEPLOY.pages.dev/#ttID` open in the app
- ✅ Live updates (web shell pulled from your deploy URL)

## Limitations to know about

- Player iframes (CinePop / VidSrc / etc.) work the same as in a browser.
  Some embeds use cookies / referrers that may behave differently in a
  WebView. Test your favorite source on TV first.
- For Play Store **TV** category submission, you'll need to fill out a
  TV-specific listing with screenshots from a TV emulator. Not required
  for sideloading.
- Cast / Picture-in-Picture from inside the embedded iframe depends on
  the player. Capacitor can wire those up natively if needed (separate
  plugin) — ping me if you want that.
