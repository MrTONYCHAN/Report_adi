# ADIGRAMS — Go-Live readiness review

This repository publishes one page: an encrypted review document served through
GitHub Pages.

`index.html` contains no readable text. The document body is AES-256-GCM
ciphertext under a key derived from an access code with PBKDF2-SHA256, and the
code is not stored here, in the page, or in CI. Opening the file without it
shows a lock screen and nothing else.

The review is regenerated from its source with
`scripts/build-protected-page.js`, which lives in the private project
repository along with the unencrypted original. Neither is kept here, and
neither should be added: the whole point of this repository is that it holds
nothing worth reading without the code.

## Publishing

Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`.

No workflow is needed. `.nojekyll` stops Pages from running the file through
Jekyll on the way out.
