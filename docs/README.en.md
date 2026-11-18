# FB Unsave All — English guide

[Español](../README.md) · [Development and verification](DEVELOPMENT.md) · [Changelog](../CHANGELOG.md)

**Version 1.3.1** processes cards with repeated links or titles through each card's own three-dot menu, including inside collections. Repeated content no longer blocks inspection or cleanup. Card verification, automatic scrolling, error sounds and Activity Log batches remain supported. Item delays accept tenths from **0.1 seconds**, including **0.3** and **0.6**, with a decimal countdown; the default remains 4 seconds.

This removes references from your saved list, not the original posts. The extension cannot restore removed saves. Delays do not guarantee protection from Facebook restrictions. Automated tests use simulated pages. In 1.0.3, real controls and their menu were inspected without removing anything; this does not verify the full real deletion cycle. Test with **one item** on your account before running a larger cleanup.

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

To update, stop any active run, download the current files or run `git pull`, then click **Reload** on the extension in `chrome://extensions`. Verify version **1.3.1**, also shown in the popup header, and reload Facebook once. Keep the extracted directory in place. No Node.js or npm packages are required for end users. This project has no official Chrome Web Store listing.

## Saved: one item at a time

1. Sign in to Facebook yourself.
2. Choose **Guardados y colecciones: uno por uno** (the new default) in the popup.
3. Click **1. Abrir todos mis guardados**, or open [facebook.com/saved/](https://www.facebook.com/saved/). Use the general view to unsave items. To clean a collection, follow the section below. Start at the top to traverse from the beginning.
4. Wait for cards to appear and close menus or dialogs. You may have already scrolled to load cards; the extension can also scroll as needed.
5. Click **2. Comprobar esta página**. **Comprobando…** appears immediately, followed by the result or exact error below the button. The reported card count is the currently recognized set, not your account's total saved items. Checking does not remove anything.
6. For the first test, set **Máximo de elementos** to **1** and **Espera entre elementos (s)** to **4**.
7. Tick the acknowledgment checkbox and click **3. Iniciar limpieza**. Acknowledgment is required once per run, in both modes.
8. Check the result. For another run, set a larger maximum or **0** to continue while more cards can be found.

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| Máximo de elementos | `0` | Integer `0`–`100000` | `0` continues until scrolling stops yielding cards. A positive number limits verified removals. |
| Espera entre elementos (s) | `4` | `0.1`–`3600`, in `0.1` steps | Minimum delay after verifying a removal and before opening the next item's menu. |

Enter **0.3** for a 300 ms pause or **0.6** for 600 ms. At most one decimal place is supported. The pause starts **after verified removal**, so the complete interval also includes Facebook's response and the existing stability check: 1 second for identified cards, 1.5 for anonymous cards. A 0.3 s pause does not mean one complete removal every 0.3 s. Activity Log delays remain whole seconds, from 3 to 3600.

For each card, the extension scrolls its controls into view if needed, opens its three-dot button, and selects the exact **Eliminar / Delete** action (or the adapter's explicitly recognized unsave variant) inside the newly opened menu. It does not select Share or Add to collection, or search the whole page for a Delete button.

It verifies that the card disappeared, with no loading or dialog pending, for one stable second before incrementing the counter. It then waits the configured delay. The actual interval between clicks includes Facebook's response and verification time. If verification fails, it stops without retrying or reloading. Unexpected confirmation dialogs require manual review.

During the pause, the popup counts down **4 s → 3 s → 2 s → 1 s** for whole-second settings, or **0.6 s → 0.5 s → 0.4 s…** for fractional settings. Session progress updates arrive immediately and the display uses the actual pause deadline. Reopening the popup shows the remaining time rather than restarting the countdown. This also applies between Activity Log batches and does not change the configured delay.

### Clean items from a collection

1. Open **Saved → My collections → your collection**, such as General. The URL must use `/saved/?list_id=…`.
2. With that tab active, select **Guardados y colecciones: uno por uno** in the extension.
3. Click **Comprobar esta página** directly. **Abrir todos mis guardados** would navigate out of the collection.
4. The result names **Eliminar de la colección / Remove from collection**. Set a maximum of **1** for the first test, choose the delay, acknowledge and start.
5. Verify the result, then increase the maximum or use **0** to continue while more cards are found.

Only the exact item-menu action **Eliminar de la colección** or **Remove from collection** is selected. Delete collection, Invite, Share and generic Delete are never selected in this view. **The collection itself is preserved.** Removing membership does not guarantee unsaving the item from the general Saved view or other collections.

Cards displaying **Este producto no está disponible ahora** without a title or link are supported. Repeated unavailable notices are anonymous cards: the original control must disappear and an observed group must contain exactly one fewer anonymous card, with no identified cards appearing inside that group, for 1.5 seconds. New cards may arrive outside its boundaries. Without surviving boundaries, only the strict whole-list count reduction with unchanged identified peers is accepted. The same limit, delay, countdown, automatic scrolling and Stop apply.

A run is bound to its initial collection. Navigating to another collection or the all-items view stops it. Start a new run for another collection. Missing actions or unverified results stop the run without selecting an alternative action or retrying.

### Blank or untitled cards

Version 1.0.7 handles the recognized blank-card structure: item-type metadata such as **Reel**, Add to collection and a known More menu, without a title or specific link. No additional option is required.

It opens that card's menu and clicks Delete once. Since 1.1.1, verification captures immediate neighbors and the anonymous block between identified boundaries. The original control must no longer represent a current card and one bounded group must contain exactly one fewer anonymous card, with no identified cards inside it. New cards outside that group are allowed. If those boundaries are lost, the strict whole-list proof is still available. Both paths require no pending loading or dialog and 1.5 seconds of stability. Multiple blank cards can be processed sequentially with the same delay and maximum.

Since 1.3.1, cards with repeated links or titles use the same group/count verification. Each occurrence is processed through its own menu, including the final copy after a full rerender. They are not skipped just because an earlier card shared their content, and no additional setting is needed.

If the original card remains, identifiable content appears inside its group, the group does not shrink by one, or references are lost without whole-list evidence, the run stops without retrying. DOM references to anonymous neighbors are valid only while those controls survive; a full ambiguous replacement is not counted. A repeated link or title alone does not trigger an error.

When no recognized pending cards remain, it scrolls to load more. Loading is allowed to finish, with a bounded timeout. If three scroll attempts yield no new cards, the run ends with an explanation. **No page reload occurs between items.** The final message distinguishes an explicitly empty view from Facebook failing to deliver more cards. Neither proves that every server-side save has been checked.

### Verification failure details

Timeouts now identify the reason: original card still present, lost references after structural changes, identifiable content inside the observed group, no one-card reduction, pending loading, open menu/dialog, no recognizable list or result not stable long enough. They do not imply that Facebook rejected the removal; check the open view manually before a new run. No automatic retry or rescue reload occurs. For identified cards, unrelated arrivals no longer reset the stability timer.

## Activity Log batches

1. Choose **Registro de actividad: lotes** and click **Abrir mis elementos guardados**.
2. If the link fails, navigate manually through **Settings & privacy → Activity log → Your Facebook activity → Saved items and collections → Your saved items**.
3. Leave All unchecked, close dialogs and click **Comprobar esta página**.
4. Start with **Máximo de lotes: 1**, **Pausa entre lotes (s): 10**, acknowledge and start.
5. Verify the result before increasing the maximum. Facebook determines each batch's size.

Limits: `1`–`500` batches; `3`–`3600` seconds between batches. This mode selects All, reads the counter only inside the selection toolbar, clicks Delete and confirms in the dialog containing Cancel and Delete. It waits for loading/blocking layers and selection to clear, with 1.5 seconds of stability, then requests a normal tab reload. Stale rows can trigger a verification reload when the interface is ready. Counters advance only after the fresh page confirms progress. An unchanged list blocks further deletion; the final batch is reloaded and verified too.

If Activity Log omits older saves, use **Guardados y colecciones: uno por uno**. The extension cannot force Facebook to provide missing data.

## Stop, recover and troubleshoot

- **Detener ejecución** prevents subsequent clicks. It cannot cancel a removal request already sent.
- Closing the popup does not stop a run. Closing the Facebook tab stops it.
- Keep Chrome open and the Facebook tab visible. Avoid operating its controls, switching profiles, navigating or manually reloading during a run.
- An unexpected reload blocks continuation. Check the result before starting a new run. State is temporary; restarting Chrome does not resume the run.
- Unknown card structures, missing menu actions or unverified removal stop the process. Repeated links or titles do not. It never selects a similarly named action to force progress.
- If a run ends while saves remain, check filters, collections, virtualization and Facebook's loading behavior manually. Another traversal from the top may be necessary.
- Resolve CAPTCHA, identity checks, errors and restrictions yourself. The extension does not bypass them.
- After changing files, reload both the extension and Facebook.
- If Check appears unresponsive, update to 1.0.3 and read the inline result. An unanswered page check times out instead of leaving the panel waiting indefinitely; it never starts removal by itself.
- If an older version reports two main areas, update to 1.0.3 and reload both the extension and Facebook. The adapter identifies the area containing recognizable saved cards. Two independent card feeds, or cards outside a nested feed, remain ambiguous and prevent clicks.
- If cards are loaded but the area is not recognized, update to 1.0.3. Earlier versions rejected accessible labels containing the post title, even though the visible button said Add to collection.
- If the three-dot menu cannot be isolated on cards without Share, update to 1.0.5. It recognizes the observed **Más opciones para el elemento guardado** label in a two-button group. An unknown second action still stops the run.
- If you see the ambiguous-identity message, update to **1.3.1** and reload both the extension and Facebook. Earlier versions rejected repeated card keys; each occurrence now uses its own three-dot menu and group/count verification.
- If a blank card stops the run, update to 1.0.7. The recognized untitled structure is processed through its own menu and verified by a one-card count reduction with unchanged identifiable peers.

When reporting an issue, include the extension and Chrome versions, language, mode and exact message. Redact private information. Never provide passwords, cookies, tokens or session files.

## Error sound

The sound is enabled automatically. Three short tones play when a run becomes **Requiere revisión**, including verification failures, unknown controls, Facebook checks or unexpected navigation. Failed popup actions such as Check or Start also alert.

Playback runs in an internal extension document and **does not require the popup to remain open**. Polling status, reopening the popup or reporting the same failed run again does not repeat the alert. A new failed run or separate failed popup action has its own alert. Normal completion, manual Stop and closing the execution tab are silent.

Use **Probar sonido de error**, below progress, before a long cleanup. It does not start or change a cleanup and works without a Facebook page. Check system volume, audio output and Chrome's sound settings. Successful media playback cannot prove that speakers were audible when the system is muted.

If Chrome cannot start playback, the sound area shows a warning while preserving the original error and stopped state. Audio failure does not resume cleaning, delay Stop or create recursive alerts. Use the test button to try again. Repeated status-poll failures are silent. Playback cannot be guaranteed while Chrome is closed or suspended or the extension cannot run.

## Privacy and permissions

All extension code ships in `extension/`. There is no remote code, telemetry, custom server or private Facebook API access. Clicking the page's controls triggers its normal requests.

`storage` keeps temporary session state, counters and the result of the last sound attempt, including the canonical authorized view URL with its `list_id` when applicable, without tracking parameters, to prevent switching collections during a run. Access to `https://www.facebook.com/*` allows DOM inspection and modification, and reinjection after Activity Log reloads. The new `offscreen` permission lets an internal document play the locally generated sound without opening a window or depending on the popup. Chrome retires the idle audio document; the extension recreates it when needed. It requests no cookie, history or password permissions. Card identities are represented by local hashes; post text and links are not stored in extension state.

There are no techniques to conceal automation or evade restrictions. Read [Facebook's terms](https://www.facebook.com/legal/terms). This project is not affiliated with Meta.

To uninstall, click **Remove** on the extension in `chrome://extensions`. This does not restore removed saves. See [DEVELOPMENT.md](DEVELOPMENT.md) for tests and contribution guidance. Licensed under [MIT](../LICENSE).
