# EarthEcho — complete website export

Includes the React/TypeScript source, live Three.js Earth, cinematic introduction,
English/Arabic interface, bundled NASA Earth/cloud/night imagery, public assets,
and a production-ready `dist/` build.

## Run and edit
Install Node.js 22.12+ (Node 24 LTS recommended), then open a terminal in this folder:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build and preview
```sh
npm run typecheck
npm run build
npm run preview
```

## Host without editing
Upload the contents of `dist/` to a static web host. Use HTTP/HTTPS, not a
file:// double-click. The build uses relative paths and can be hosted in a subfolder.
If your host supports redirects, configure unknown page routes to serve index.html.
For source rebuilds requiring an absolute base, set BASE_PATH before npm run build.

## Included and external resources
- NASA texture files are bundled locally; see TEXTURE_CREDITS.md.
- Google Fonts still downloads the display/UI/Arabic fonts when online.
  System fallbacks apply if fonts are unavailable.
- NASA/NSIDC source links lead to external sites.
- A WebGL-capable browser/GPU is needed for 3D; the accessible fallback and retry
  interface is preserved.
- Audio/voice and live scientific datasets are not connected. The experience
  previews and honest unavailable-audio notices are intentionally preserved.
- No API server is required by this website.
- No secrets, .env files, Replit workspace settings, personal project memory,
  or installed dependencies are included.

The export includes portable build configuration, relative-path router support,
updated page descriptions, and local NASA texture URLs. This ZIP is an export;
the original working project was not modified by these packaging adjustments.
