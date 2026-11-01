# Privacy policy — modplayjs

modplayjs plays tracker modules, Commodore 64 SID tunes and audio files that are
already on your device. It is a local player; there is no server, no account and
no sync.

## What the app accesses

- **Folders you pick.** You add folders through Android's Storage Access
  Framework. The app stores the grant Android hands back, reads the file names
  and sizes to build its library, and reads a file only when you play it. It
  never writes to, deletes or modifies your files.
- **Playback state.** Volume, queue and settings are stored on the device: a
  small Room database and a preferences file in the app's private storage.
  Android's backup can include them if you have device backup enabled.

## What the app does not do

- It has no `INTERNET` permission, so it cannot send anything anywhere, and it
  contains no analytics, advertising, crash-reporting or attribution SDK.
- It does not collect device identifiers, location, contacts, or usage data.
- It does not record audio, take photos, or access the microphone or camera.
- It does not share or sell anything, because it has nothing to share.

## Permissions

- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`: keep
  playback running while the screen is off.
- `POST_NOTIFICATIONS`: show the playback notification with its transport
  controls. Declining it only hides the notification.

## Removing your data

Uninstall the app, or use Android's *Clear storage* for modplayjs. Both delete
the library database and settings. Your music files are untouched.

## Contact

Issues and questions: the repository at
<https://github.com/modplayjs/modplayjs>.
