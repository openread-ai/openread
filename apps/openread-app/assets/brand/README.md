# OpenRead brand app icon source

`openread-icon-manifest.json` is the canonical app-icon generation manifest. It references the flat app icon source plus Android foreground/monochrome sources used to generate OpenRead launcher, PWA, package, and store icon derivatives.

The checked-in source artwork and manifest are canonical; no external machine path is required.

Derivative assets are checked in because platform build systems consume fixed file names and sizes.
Regenerate Tauri/native derivatives from the app package with:

```bash
pnpm --filter @openread/openread-app tauri icon assets/brand/openread-icon-manifest.json
node apps/openread-app/scripts/brand/flatten-ios-app-icons.mjs
```

The flatten step composites iOS/iPadOS AppIcon PNGs onto an opaque white background and rewrites them as RGB/no-alpha PNGs for native/App Store compatibility.

Then refresh web/store/package derivatives from the generated native icon outputs:

- `apps/openread-app/public/icon.png` from `apps/openread-app/src-tauri/icons/icon.png`
- `apps/openread-app/public/apple-touch-icon.png` from `apps/openread-app/src-tauri/icons/ios/AppIcon-60x60@3x.png`
- `apps/openread-app/public/favicon.ico` from `apps/openread-app/src-tauri/icons/icon.ico`
- `apps/openread-app/public/icon-tiny.png` from an appropriately sized square generated AppIcon
- `fastlane/metadata/android/en-US/images/icon.png` from a 512x512 generated icon
- `data/icons/openread-book.png` from a generated high-resolution icon
