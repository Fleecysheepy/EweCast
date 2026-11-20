# EweCast

A home-screen weather and news briefing for Grande Prairie, Alberta. Open [EweCast](https://fleecysheepy.github.io/EweCast/) in Safari, tap Share → Add to Home Screen, enable Open as Web App if offered, and tap Add.

The app requests Open-Meteo forecasts and Environment Canada GeoMet weather alerts directly. A scheduled GitHub Pages build publishes a same-origin snapshot of the Alberta Emergency Alert Atom feed and CBC Edmonton headlines. GitHub may delay scheduled runs. Feed age and failures are surfaced independently. Cached weather is labelled and expires after six hours. Emergency feed status expires after two hours. Official links stay available when a check fails.

Casty uses Kokoro Heart, generated on-device after an initial model download. The device voice is available as a fallback. Start briefing reads weather, safety, and headlines in that order. Stop cancels playback. Safety data refreshes while the app is open. EweCast does not deliver emergency push notifications.

For development, run `python3 tools/feeds.py` and serve the repository root with `python3 -m http.server 8000`. GitHub Pages uses GitHub Actions as its publishing source.

