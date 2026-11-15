# FB Unsave All — English guide

[Español](../README.md) · [Development and verification](DEVELOPMENT.md)

FB Unsave All is a local Chrome extension that clears your Facebook saved items using the batch controls in Activity Log. It reloads the tab **only after a loading indicator has appeared and then disappeared for 1.5 seconds** and the confirmation dialog has closed. It resumes after that reload.

**Version 0.1.0 is an initial implementation pending verification on a real Facebook account.** Automated tests use simulated pages. They do not establish compatibility with every Facebook rollout or guarantee successful deletion on a particular account.

## Install

1. Download this repository using **Code → Download ZIP**, then extract it, or clone it:

   ```bash
   git clone https://github.com/jadelagarza/fb-unsave-all.git
   ```

2. Use desktop Google Chrome 120 or newer on macOS, Windows, or Linux.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Click **Load unpacked**, then select this repository's **`extension` directory**, which contains `manifest.json`.
5. Pin **FB Unsave All** in Chrome's extensions menu if desired.
6. Reload an already-open Facebook tab once after installing or updating the extension.

Keep the extracted directory in place. This project is not currently published on Chrome Web Store. End users do not need Node.js or any npm packages.

## Start with one batch

1. Sign in to Facebook yourself. The extension does not manage passwords or two-factor authentication.
2. Open the extension popup and click **1. Abrir mis elementos guardados**. This navigates your current Facebook tab to the Activity Log saved-items link. It does not delete anything by itself.
3. If the link does not work, navigate manually: **Settings & privacy → Activity log → Your activity across Facebook → Saved items and collections → Your saved items**. Clear date filters and any existing selection.
4. Keep Facebook in Spanish or English. The adapter requires the dedicated heading **Tus elementos guardados** or **Your saved items**, plus a recognized **Todo / All / Select all** checkbox.
5. Click **2. Comprobar esta página**. Inspection does not select or delete anything.
6. Keep **Máximo de lotes** at **1** and **Pausa entre lotes (s)** at **10** for the first run. Read and tick the acknowledgement, then click **3. Iniciar limpieza**.
7. Keep Chrome open and the Facebook tab visible. Do not manually operate that tab or switch Facebook profiles during a run. Closing the popup does not stop the run.
8. The extension selects All, reads the selected count, clicks the toolbar Delete button, then the confirmation-dialog Delete button. It observes loading before performing a normal tab reload. Even the final authorized batch is reloaded.
9. Check the general Saved screen manually to confirm that the trial batch was actually unsaved.

Once the trial works, start a new run with a suitable batch limit. Roughly 1,500 saved items at 20 per batch require 75 batches. A limit of 100 leaves room; the run stops early if Facebook explicitly reports an empty list. The selected batch size comes from Facebook and is not hard-coded to 20.

The batch limit accepts 1–500; the pause accepts 3–3,600 seconds. These are workload controls, **not Meta-approved safe automation thresholds**. Counters reset for each new run. The processed-item count reflects the selection counter and observed loading completion, not server-certified deletion.

## Stopping and failures

- Click **Detener ejecución** to stop subsequent actions, or close the authorized Facebook tab. A deletion already confirmed cannot be cancelled or undone by this tool.
- If a loader is not observed within 15 seconds, or does not finish within 90 seconds after detection, the extension stops without a blind reload or retry.
- Unrecognized or ambiguous controls, a recognized error or security challenge, a pre-existing selection, or an unchanged list after reload stops the run.
- Missing controls alone do not count as an empty list. Only a recognized explicit empty-list message finishes it as empty.
- An unexpected manual reload during a pending batch blocks automatic resumption. Inspect the outcome before starting again.
- After updating the extension in `chrome://extensions`, reload Facebook too.

Progress is kept in extension session memory. It survives page reloads and service-worker suspension, but is cleared when the browser closes or the extension is disabled, updated, or reloaded. Opening Chrome never starts a cleanup automatically.

## Privacy and risk

The extension requests temporary storage and access to `https://www.facebook.com/*`. This gives it permission to read and change Facebook's DOM; review the included source before installing. It does not request cookie/password/history permissions, export sessions, add analytics, fetch remote code, or call private Facebook APIs. It stores counters and a local hash, not saved-post text or links.

Automation can trigger restrictions or checks, and pauses do not guarantee otherwise. The extension does not bypass CAPTCHAs, identity checks, or rate limits. Review [Facebook's terms](https://www.facebook.com/legal/terms) and [Meta's explanation of automation controls](https://about.fb.com/news/2021/04/how-we-combat-scraping/). This project is not affiliated with Meta and does not claim Meta has authorized it.

When reporting an issue, provide the exact error, Chrome version, Facebook language, and the step that failed. Redact personal content from screenshots. Never provide cookies, passwords, tokens, or session files.

To uninstall, open `chrome://extensions` and click **Remove**. Removing the extension does not restore items already unsaved. See [MIT license](../LICENSE).
