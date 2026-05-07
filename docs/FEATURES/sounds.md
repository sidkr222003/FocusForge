# FocusForge Sounds

FocusForge has a dedicated **Focus Sounds** view. It does not bundle MP3 files in the extension package. Instead, it discovers public MP3 files from GitHub and streams the selected file only when the user presses play.

## GitHub MP3 Library

Default GitHub folder:

```text
https://github.com/sidkr222003/FocusForge/tree/main/media/sounds
```

The source field accepts:

- A GitHub folder URL, such as `/tree/main/media/sounds`.
- A GitHub file URL, such as `/blob/main/media/sounds/cafe.mp3`.
- A raw GitHub folder or file URL.
- Any direct public HTTPS `.mp3` URL.

When a folder URL is used, FocusForge asks the GitHub Contents API for the real `.mp3` files and only renders files that exist. This avoids broken fixed cards like `rain.mp3` when that file is not present.

## Music For Programming

The Focus Sounds view also loads the public `musicforprogramming.net` RSS feed, inspired by [`isdampe/music-for-programming`](https://github.com/isdampe/music-for-programming). Episodes are displayed as playable cards and stream directly from their published audio URLs.

## Packaging

`.vscodeignore` excludes `media/sounds/*.mp3`, so local MP3 files are not packed into the VSIX. Keep the MP3 files in the GitHub repository or another public raw-file host if you want installed extensions to stream them.

For custom in-extension playback, use GitHub-hosted MP3 files that you own or are licensed to use.
