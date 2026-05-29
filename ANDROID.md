# Turning CinePop into an Android APK

You already have a fully-installable PWA. To wrap it as an Android `.apk` /
`.aab` you have **three** good options. Pick the one that fits your goal.

> **Prerequisite for all three**: deploy the PWA to a public HTTPS URL
> first (see [DEPLOY.md](./DEPLOY.md) — Cloudflare Pages takes ~30 s).
> Let's call that URL `https://CinePop.pages.dev` below — replace it
> with yours.

---

## 🟢 Option 1 — PWABuilder.com (zero code, 5 min)

The easiest by far. Microsoft's free service generates a signed APK + Play
Store-ready `.aab` from any URL.

1. Open <https://www.pwabuilder.com/>
2. Paste `https://CinePop.pages.dev`, click **Start**
3. Scroll to **Android** → **Generate Package**
4. Pick **Google Play** (for Store) or **Other Android** (for a side-loadable APK)
5. Download the zip — inside you get:
   - `app-release-signed.apk` (install with `adb install` or any file manager)
   - `app-release-bundle.aab` (upload to Google Play Console)
   - `assetlinks.json` (drop into your site at `/.well-known/assetlinks.json`
     to remove the URL bar — already auto-served by Cloudflare Pages once
     the file is in the repo)

Done. The "app" is a Trusted Web Activity (TWA) — basically a Chrome window
without browser chrome, full-screen, with your icon + splash. Updates ship
automatically because the app pulls from your live URL.

---

## 🟡 Option 2 — Bubblewrap CLI (same TWA, local control)

Same end result as PWABuilder but you generate locally and own the keystore.

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://CinePop.pages.dev/manifest.webmanifest
# Answer the prompts (app name, package id, signing key)
bubblewrap build
# -> app-release-signed.apk + app-release-bundle.aab
```

After the first build, save the generated `assetlinks.json` to
`CinePop/public/.well-known/assetlinks.json` (the values are printed
to your terminal) and redeploy.

---

## 🔴 Option 3 — Capacitor (best for Android TV + offline-first)

Capacitor wraps your web app in a native Android shell. **This is what you
want if you need Android TV support** (TVs require a special activity
flagged with `LEANBACK_LAUNCHER` — TWAs don't qualify as "TV apps" in the
Play Store TV category).

The `android-capacitor/` folder in this repo is a ready-made starter.

```bash
cd CinePop/android-capacitor
npm install
npx cap sync
npx cap open android      # opens Android Studio → Run/Build → APK
```

Then in Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
Output: `android/app/build/outputs/apk/release/app-release.apk`.

### What's pre-configured
- **Phones + tablets + Android TV** in one APK (Leanback launcher intent)
- Network-loaded from your live Cloudflare URL (instant updates) — change
  to bundled offline assets in `capacitor.config.ts` if you prefer
- D-pad / remote navigation enabled
- Auto-fullscreen / immersive mode for TVs
- App icon + splash from `CinePop/icons/`

---

## Which one should you pick?

| Goal                                                  | Pick                |
|-------------------------------------------------------|---------------------|
| "Just give me an APK to install on my phone"          | **Option 1**        |
| "I want it in the Play Store, my own signing key"     | **Option 2**        |
| "Android TV / Fire TV / Google TV"                    | **Option 3**        |
| "Tablet + phone + TV from one project"                | **Option 3**        |
| "Native Android features (downloads, Cast, etc.)"     | **Option 3**        |

---

## Testing without publishing

### Phone (any option)
1. On your Android phone → **Settings → Security → Install unknown apps** → enable for your browser/file manager
2. Send yourself the APK (email, Drive, USB)
3. Tap to install

### Android TV (Option 3 only)
1. Enable **Developer options** on the TV (Settings → Device → About → tap Build 7×)
2. Enable **USB debugging** and **Install from unknown sources**
3. `adb connect <tv-ip>:5555`
4. `adb install app-release.apk`

Or sideload via the "Send Files to TV" app from another device.

---

## Splash & icon — already done

The icons in `CinePop/icons/` and the `theme_color` / `background_color`
in `manifest.webmanifest` are picked up automatically by all three options.
No extra work needed.
