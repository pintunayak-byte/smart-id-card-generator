# Smart ID Card Maker — Stage 3

A small, offline-first Progressive Web App (PWA) starter for managing student and employee records, institution details, and profile photos.

## Included in Stage 3

- Institution name, address, phone, session, brand colour, and logo.
- Add/edit/search/delete student and employee records.
- Unique ID validation.
- Camera capture (requires a secure HTTPS page or localhost and browser permission).
- Photo upload from device storage.
- Live ID card preview.
- Local persistence: records and photos use IndexedDB; institution settings use localStorage.
- Basic PWA service worker caching for repeat/offline use.

## Not yet included

Excel/CSV import, ZIP photo matching, crop/zoom editor, bulk PDF generation, card-template editor, Google Sheets connection, and backup/export. These should be added in later stages. Do not use this prototype as the only storage for important records until backup/export is implemented.

## Run on your phone for free

### Easiest route: GitHub Pages

1. Sign in to GitHub and create a new **public** repository, e.g. `smart-id-card-maker`.
2. Upload the files from this folder to the repository root: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, and `sw.js`.
3. In the repository, open **Settings → Pages**.
4. Under build/deployment, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish the site. Open the published HTTPS URL on your phone.
6. In Chrome on Android, open the site menu and choose **Add to Home screen** or **Install app** if shown.

GitHub Pages is free for public repositories, subject to GitHub's current terms and limits. Do not upload real student data, photos, or private records to the repository. Only publish the app's source code.

### Camera note

Camera capture generally works only in a secure context (HTTPS or localhost). On GitHub Pages, approve the browser's camera permission. If camera access is unavailable, use **Choose photo**.

### Offline note

Open the hosted app online once so the service worker can cache the app shell. After that, the shell can load offline in the same browser profile. Data is saved in that browser's local storage, not synchronized across devices.

## Data safety

- Keep a private backup of any important records once export/backup is added.
- Clearing browser site data may delete records and photos.
- Do not share the device/browser profile with people who should not see these records.
- The current prototype does not upload records or photos to a server.

## Local development (optional)

Any static HTTP server can serve these files. Camera APIs may not work when opening `index.html` directly from a file manager.

## Next stages

1. Excel/CSV import and validation.
2. Crop/rotate photo editor and ZIP photo matching.
3. Editable card templates, exact card sizes, front/back layouts.
4. Bulk PDF generation and individual image export.
5. Backup/restore and optional Google Sheets integration.


### Stage 3 card layout update
- Landscape school ID card styled to follow the user reference: dark-blue school header, logo without a border, portrait on the left, Hindi-labeled student details on the right, orange/blue curved footer, and principal signature area.
- The address row on the card currently uses the record Additional details field; use it for the student address.
