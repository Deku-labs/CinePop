# Offline-bundled APK

A version of the app where the **HTML + JS + CSS + icons live inside the APK
itself**. Once installed, opening the app doesn't need to fetch any web files
from the internet.

> ⚠️ "Offline" here means the **app shell is offline**. The app still needs
> internet for:
> 1. **IMDb search suggestions** (titles, posters, ratings)
> 2. **Watching anything** (the player is an `<iframe>` loading a third-party
>    streaming embed — those obviously need internet)
>
> So this is genuinely useful for: instant launch (no first-load network),
> works without DNS, no Cloudflare URL needed, distributable as a single file.

## What's in this folder

| File | Purpose |
|---|---|
| `bundle-offline.sh`              | Copies the PWA into `src/`, rewrites `IMDB_API` to hit IMDb directly (Android WebView ignores CORS), flips Capacitor to offline mode |
| `capacitor.config.offline.json`  | Capacitor config with NO `server.url` — webview loads from APK assets |
| `capacitor.config.json`          | The live config (gets overwritten by `bundle-offline.sh`) |
| `src/`                           | Where the bundled PWA lands |
| `android-overrides/AndroidManifest.xml` | TV-ready manifest |

## How to build it — 3 ways

### 🟢 Easiest: let GitHub Actions build it (no Mac setup needed)

1. Push this repo to GitHub (any branch named `main` or `master`)
2. Open the **Actions** tab → wait for **"Build OFFLINE Android APK"** to finish
   (or click **Run workflow** to trigger manually)
3. Click the green run → scroll to **Artifacts** → download `playimdb-offline-apk`
4. Unzip → `app-debug.apk` → install on your phone/TV

**This is the answer to "where is the APK?":** the GitHub Actions artifact.
The APK literally does not exist anywhere until someone (Actions or you)
compiles it.

### 🟡 Medium: build locally on a Mac with Android Studio

Requires: Node 18+, Java 17, Android Studio installed.

```bash
cd CinePop/android-capacitor

# One-time
npm install
npx cap add android

# Every time
./bundle-offline.sh                                      # bundle PWA + flip config
cp android-overrides/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
npx cap sync android

# Build
cd android && ./gradlew assembleDebug
```

APK appears at:
```
android-capacitor/android/app/build/outputs/apk/debug/app-debug.apk
```

Or open in Android Studio for a GUI:
```bash
npx cap open android
# then: Build → Build Bundle(s) / APK(s) → Build APK(s)
```

### 🔴 No Mac, no GitHub: use a free online build service

- <https://www.pwabuilder.com/> — paste your deployed URL, get an APK (this is
  the *online* variant — your phone fetches the URL on launch)
- <https://appetize.io/> — runs the APK in a browser-based emulator

## Switching back to the LIVE (web-loaded) APK

If you'd rather have the wrapper load from your Cloudflare URL (so updates
ship instantly without a rebuild), just restore the live config:

```bash
cd android-capacitor
git checkout capacitor.config.json   # restore the version with server.url
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Side-by-side comparison

|                          | Live (loads from URL)         | Offline (bundled)              |
|--------------------------|-------------------------------|--------------------------------|
| Needs deployed URL?      | Yes (Cloudflare Pages)        | No                              |
| First launch time        | Quick (cached after 1st)      | Instant                         |
| PWA update mechanism     | Auto (next launch)            | Rebuild + reinstall APK         |
| Works on flaky wifi      | Cached SW helps               | Better                          |
| Search needs internet?   | Yes                           | Yes                             |
| Playback needs internet? | Yes                           | Yes                             |
| APK size                 | Tiny (~3 MB)                  | A bit bigger (~5 MB)            |
| Best for                 | Active development            | Sideloading to friends/TVs      |

## FAQ

**Q: Can you build the APK for me right now in this chat?**
A: No environment I can run commands in has the Android SDK or Java 17, and
there's no way to upload a 5 MB binary back through chat. The GitHub Actions
workflow is purpose-built so *you* push code and get a downloadable APK in
~5 minutes without installing anything on your Mac.

**Q: Why does the offline APK still need internet?**
A: Because video streaming and IMDb search both need network. "Offline-bundled"
means the *UI shell* is bundled, not the videos.

**Q: Will the offline APK work without Cloudflare deployed at all?**
A: Yes. The `src/` folder is everything the app needs to render — search
hits IMDb directly from the Android WebView.
