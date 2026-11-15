# FB Unsave All — English guide

[Español](../README.md) · [Development and verification](DEVELOPMENT.md) · [Changelog](../CHANGELOG.md)

**Version 1.0.0** adds one-at-a-time removal on [Facebook Saved](https://www.facebook.com/saved/), with automatic scrolling and a configurable delay. Activity Log batches remain available. The popup is in Spanish; the adapters recognize the documented Spanish and English controls.

This removes references from your saved list, not the original posts. The extension cannot restore removed saves. Delays do not guarantee protection from Facebook restrictions. Automated tests use simulated pages; test the new mode with **one item** on your account before running a larger cleanup.

## Install or update

1. Use desktop Google Chrome 120 or newer on macOS, Windows or Linux.
2. Download **Code → Download ZIP** and extract it, or clone:

   ```bash
   git clone https://github.com/jadelagarza/fb-unsave-all.git
   ```

3. Open `chrome://extensions` and enable **Developer mode**.
4. Choose **Load unpacked** and select the repository's **`extension` directory**, containing `manifest.json`.
5. Open **FB Unsave All** from Chrome's extensions menu.
6. Reload an already-open Facebook tab once to activate the content script.

To update, stop any active run, download the current files or run `git pull`, then click **Reload** on the extension in `chrome://extensions`. Verify version **1.0.0** and reload Facebook once. Keep the extracted directory in place. No Node.js or npm packages are required for end users. This project has no official Chrome Web Store listing.

## Saved: one item at a time

1. Sign in to Facebook yourself.
2. Choose **Guardados: uno por uno** (the new default) in the popup.
3. Click **1. Abrir mis elementos guardados**, or open [facebook.com/saved/](https://www.facebook.com/saved/). Use the general saved-items view outside any collection. Start at the top to traverse from the beginning.
4. Wait for cards to appear and close menus or dialogs. You may have already scrolled to load cards; the extension can also scroll as needed.
5. Click **2. Comprobar esta página**. The reported card count is the currently recognized set, not your account's total saved items.
6. For the first test, set **Máximo de elementos** to **1** and **Espera entre elementos (s)** to **4**.
7. Tick the acknowledgment checkbox and click **3. Iniciar limpieza**. Acknowledgment is required once per run, in both modes.
8. Check the result. For another run, set a larger maximum or **0** to continue while more cards can be found.

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| Máximo de elementos | `0` | Integer `0`–`100000` | `0` continues until scrolling stops yielding cards. A positive number limits verified removals. |
| Espera entre elementos (s) | `4` | Integer `1`–`3600` | Minimum delay after verifying a removal and before opening the next item's menu. |

For each card, the extension scrolls its controls into view if needed, opens its three-dot button, and selects the exact **Eliminar / Delete** action (or the adapter's explicitly recognized unsave variant) inside the newly opened menu. It does not select Share or Add to collection, or search the whole page for a Delete button.

It verifies that the card disappeared, with no loading or dialog pending, for one stable second before incrementing the counter. It then waits the configured delay. The actual interval between clicks includes Facebook's response and verification time. If verification fails, it stops without retrying or reloading. Unexpected confirmation dialogs require manual review.

When no recognized pending cards remain, it scrolls to load more. Loading is allowed to finish, with a bounded timeout. If three scroll attempts yield no new cards, the run ends with an explanation. **No page reload occurs between items.** The final message distinguishes an explicitly empty view from Facebook failing to deliver more cards. Neither proves that every server-side save has been checked.

## Activity Log batches

1. Choose **Registro de actividad: lotes** and click **Abrir mis elementos guardados**.
2. If the link fails, navigate manually through **Settings & privacy → Activity log → Your Facebook activity → Saved items and collections → Your saved items**.
3. Leave All unchecked, close dialogs and click **Comprobar esta página**.
4. Start with **Máximo de lotes: 1**, **Pausa entre lotes (s): 10**, acknowledge and start.
5. Verify the result before increasing the maximum. Facebook determines each batch's size.

Limits: `1`–`500` batches; `3`–`3600` seconds between batches. This mode selects All, reads the counter only inside the selection toolbar, clicks Delete and confirms in the dialog containing Cancel and Delete. It waits for loading/blocking layers and selection to clear, with 1.5 seconds of stability, then requests a normal tab reload. Stale rows can trigger a verification reload when the interface is ready. Counters advance only after the fresh page confirms progress. An unchanged list blocks further deletion; the final batch is reloaded and verified too.

If Activity Log omits older saves, use **Guardados: uno por uno**. The extension cannot force Facebook to provide missing data.

## Stop, recover and troubleshoot

- **Detener ejecución** prevents subsequent clicks. It cannot cancel a removal request already sent.
- Closing the popup does not stop a run. Closing the Facebook tab stops it.
- Keep Chrome open and the Facebook tab visible. Avoid operating its controls, switching profiles, navigating or manually reloading during a run.
- An unexpected reload blocks continuation. Check the result before starting a new run. State is temporary; restarting Chrome does not resume the run.
- Unknown cards, ambiguous identities, missing menu actions or unverified removal stop the process. It never selects a similarly named action to force progress.
- If a run ends while saves remain, check filters, collections, virtualization and Facebook's loading behavior manually. Another traversal from the top may be necessary.
- Resolve CAPTCHA, identity checks, errors and restrictions yourself. The extension does not bypass them.
- After changing files, reload both the extension and Facebook.

When reporting an issue, include the extension and Chrome versions, language, mode and exact message. Redact private information. Never provide passwords, cookies, tokens or session files.

## Privacy and permissions

All extension code ships in `extension/`. There is no remote code, telemetry, custom server or private Facebook API access. Clicking the page's controls triggers its normal requests.

`storage` keeps temporary session state and counters. Access to `https://www.facebook.com/*` allows DOM inspection and modification, and reinjection after Activity Log reloads. It requests no cookie, history or password permissions. Card identities are represented by local hashes; post text and links are not stored in extension state.

There are no techniques to conceal automation or evade restrictions. Read [Facebook's terms](https://www.facebook.com/legal/terms). This project is not affiliated with Meta.

To uninstall, click **Remove** on the extension in `chrome://extensions`. This does not restore removed saves. See [DEVELOPMENT.md](DEVELOPMENT.md) for tests and contribution guidance. Licensed under [MIT](../LICENSE).
