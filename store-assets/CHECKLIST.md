# Chrome Web Store Publishing Checklist

## ✅ Ready

- [x] **Extension ZIP** — `visual-github-reporter.zip` (384 KB)
- [x] **Store listing text** — `listing.md`
- [x] **Privacy policy** — `privacy-policy.md`
- [x] **Permissions justification** — `permissions-justification.md`
- [x] **manifest.json** — Version 1.0.0, all required fields

## 📸 Screenshots Needed

Chrome Web Store requires **1-5 screenshots** (1280x800 or 640x400).

### Suggested screenshots:

1. **Main popup** — Extension popup showing repo selector and "Report Issue" button
2. **Screenshot capture** — The region selection overlay on a webpage
3. **Annotation tools** — Drawing on the captured screenshot
4. **Issue form** — Filling in the issue details
5. **Settings** — GitHub token and repo configuration

### How to capture:
1. Install the extension locally (`chrome://extensions` → Load unpacked → select `dist/`)
2. Use Chrome DevTools device toolbar for consistent 1280x800
3. Or use a screenshot tool with fixed dimensions

## 🖼️ Store Graphics

| Asset | Size | Required |
|-------|------|----------|
| Icon | 128x128 | ✅ Yes (in ZIP) |
| Small promo tile | 440x280 | No |
| Large promo tile | 920x680 | No |
| Marquee promo tile | 1400x560 | No |

## 📋 Store Listing Fields

| Field | Value |
|-------|-------|
| Name | Visual GitHub Reporter by Studio N.O.P.E. |
| Category | Developer Tools |
| Language | English |
| Visibility | Public |

## 🔗 URLs Needed

- **Privacy policy URL**: `https://www.studionope.nl/vgr-policy`
- **Support URL**: `https://github.com/N-O-P-E/visual-github-reporter/issues`
- **Website**: `https://www.studionope.nl`

## 🚀 Publishing Steps

1. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay $5 one-time fee (if not done)
3. Click "New Item"
4. Upload `visual-github-reporter.zip`
5. Fill in store listing from `listing.md`
6. Add privacy policy URL
7. Upload screenshots
8. Submit for review

## ⏱️ Timeline

- Review typically takes **1-3 business days**
- May ask for clarifications on permissions
- Once approved, immediately available in store
