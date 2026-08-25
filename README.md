# Future Web Lab

A GitHub Pages-ready, file-driven web development learning platform with a futuristic UI, smart browser editor, sandboxed live preview, local autosave and ZIP export.

## Teacher workflow

1. Create a folder inside `classes/`.
2. Put the complete project there: source files, assets and `class.json`.
3. Commit and push to `main`.
4. GitHub Actions builds and deploys the site automatically.

### Example

```text
classes/
└── 003-flexbox/
    ├── class.json
    ├── index.html
    ├── css/
    │   └── style.css
    ├── js/
    │   └── app.js
    └── assets/
        ├── image.webp
        └── demo.mp4
```

## Branding

Edit `site.config.json`. No UI code changes are needed for normal branding changes.

## Run locally

```bash
npm run build
npm run dev
```

Open `http://localhost:4173`.

## GitHub Pages

Enable GitHub Pages with **GitHub Actions** as the source. Push to `main` and the workflow will build `dist/` and deploy it.

## Notes

- Student edits are stored locally in the browser.
- Download ZIP exports the original or modified project.
- Live preview is sandboxed.
- Large/binary assets are fetched on demand rather than kept in memory by the app.
