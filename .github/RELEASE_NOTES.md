**Blorb** — drop matching bubbles to merge them into bigger ones, and keep the stack below the line. 🫧

## ⬇️ Which file do I download?

Find the file under **Assets** below whose name **ends with**:

| Your device | File ends with |
|---|---|
| 🍎 **Mac — Apple Silicon** (M1 / M2 / M3 / M4) | **`_aarch64.dmg`** |
| 🍎 **Mac — Intel** | **`_x64.dmg`** |
| 🪟 **Windows** | **`_x64-setup.exe`** (or `_x64_en-US.msi`) |
| 🐧 **Linux** | **`_amd64.AppImage`** (or `.deb` / `.rpm`) |

> Not sure which Mac you have? Apple menu → **About This Mac**. "Apple M…" = Apple Silicon · "Intel" = Intel.

## 🍎 macOS — "Blorb is damaged and can't be opened"?

It's **not** damaged — the app just isn't notarized yet, so macOS quarantines it on download. Clear it once:

1. Open the `.dmg` and drag **Blorb** into your **Applications** folder.
2. Open **Terminal** (press ⌘ + Space, type `Terminal`, press Enter) and paste:
   ```
   xattr -dr com.apple.quarantine /Applications/Blorb.app
   ```
3. Open **Blorb** from Applications — it works from now on.

## 🪟 Windows — "Windows protected your PC"?

Click **More info → Run anyway**. (Same reason: the app isn't code-signed yet.)

---

*The `*.app.tar.gz` files are for the auto-updater — you can ignore them.*
