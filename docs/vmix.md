# vMix: what Esportra Air can do (read 28 Nov 2026)

Sources:
- vMix User Guide 29, Developer Information › HTTP Web API: https://www.vmix.com/help29/DeveloperAPI.html
- Shortcut Function Reference: https://www.vmix.com/help29/ShortcutFunctionReference.html
- TCP API: https://www.vmix.com/help27/TCPAPI.html

## Documented facts
- **The Web API.** "The vMix API provides access to common functions through the HTTP protocol", for example `http://127.0.0.1:8088/api/?Function=Fade&Duration=1000`. It "uses the same web address as the standard Web Interface and can be configured from the Web tab in Settings". Any function from the Shortcuts list can be called.
- **Naming an input.** `Input=` takes a number, the exact (case-sensitive) title, or the GUID from the `key` attribute in the XML.
- **Reading the inputs.** With no parameters, `/api/` "will return state information in XML format": `<vmix><inputs><input key="…" number="…" type="…" title="…" …>`.
- **`SetInputName`** — "Set the Display Name of the Input". `Value` is the name, plus `Input`.
- **`BrowserNavigate`** — `Value` is the URL, plus `Input`. **`BrowserReload`** — `Input`.
- **`AddInput`** — "Create a new Input based on information provided in Value". The documented types are Video, Image, Photos, Title, VideoList, Colour, AudioFile, Flash and PowerPoint (`Type|Filename`). **A Web Browser input is not among them.**
- **Functions that change what is on air**, which Air must never call: `Fade`/transitions, `Cut`, `ActiveInput`, `PreviewInput*`, `OverlayInput*In/Out`, `SetOutput*`, `SetLayer*`/`LayerOn*`, `MultiViewOverlay*`.

## What Air does with vMix (only what is documented)
1. The producer adds the browser inputs in vMix once (Add Input › Web Browser), one per Air page. Air lists which pages are needed, each with a Copy address button.
2. Air connects to the producer's vMix Web API (`host:8088`, local network only) and reads `/api/`.
   - It finds the Web Browser inputs.
   - The producer pairs each one with an Air page, or Air pairs those already titled `ESPORTRA · …`.
3. On pairing, Air renames the input to `ESPORTRA · <page>` (`SetInputName`) and points it at the page (`BrowserNavigate`). After that it only checks that each input still exists, and offers Reload (`BrowserReload`).
4. Air never adds, removes, cuts, fades, overlays, layers or outputs anything in vMix. The crew runs vMix.

Not documented, so not used: adding a Web Browser input remotely, and the vMix preset file format.
