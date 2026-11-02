# Closed-test plan

The production-access application asks what testers did, what they reported and
what changed. This is the list to hand them, so the answers exist whether or not
anything breaks.

## What testers should do

Each line is a behaviour, not a bug hunt. "It worked" is a result; write down
what was on screen when it worked.

| area | do this | what usually breaks |
| --- | --- | --- |
| Library | Grant a folder with 1,000+ files, let the scan finish, then search and filter by format and channel count | scanning stalls, wrong format labels, filters that empty the list |
| Permission loss | Revoke the folder grant in system settings, reopen the app | crash instead of a "folder unavailable" state |
| Playback | Play a MOD, an XM, an IT, a SID and an MP3 back to back | wrong length, no seek, wrong artist line, silence on one format |
| Track change | Skip ten tracks quickly, twice | notification stops updating, duplicate cards, stale title |
| Background | Play, press Home, wait two minutes, return | playback stops, position jumps, card gone |
| Screen off | Play with the screen off for five minutes, use headset play/pause | stops on its own, buttons dead |
| Bluetooth | Connect and disconnect a headset mid-track | audio routes nowhere, playback pauses forever |
| Notification | Pause, swipe the card, resume from the app | card missing, wrong button, paused card dismissed |
| Rotation | Rotate during playback twice, with the keyboard open | restart, position reset, layout clipped |
| Locale | Switch the app to German, then back | untranslated strings, truncated buttons |
| Text size | Set font scale to 200% | overlapping rows, cut-off labels |
| Screen reader | Enable TalkBack, navigate the transport and the pattern view | unlabeled icons, unreadable pattern cells |
| Large queue | Start playback from the full library | ANR, minutes of nothing, memory spike |
| Low battery | Turn on battery saver, play in the background | playback killed by the system |
| Long session | Leave it playing for an hour | drift, underruns, rising memory |

## What to record

For each session, one of these:

- **Worked:** the action, the device, Android version, and what you saw.
- **Broke:** the same, plus what you expected and the exact moment.

Do not send "no bugs" without the list of what was tried; that is the one answer
that cannot be used in the application form.

## Where the automated evidence comes from

- **Pre-launch report** (Play Console → Test and release → Pre-launch report):
  runs the bundle on Google's own devices and reports stability (crashes, ANRs,
  non-SDK interfaces), performance (startup, memory, CPU, network), accessibility
  (labels, touch targets, contrast) and screenshots per language and density.
  Its warnings are findings even when every human tester came back clean, and
  they are cheap to fix before production.
- **Parity harnesses** in `tools/`: loader byte-parity, mixer-state goldens and
  render correlation. Those cover the engine, not the Android shell, so they
  support the claim "the audio path is verified" and nothing more.

## Filling the form

Three sections, and no slot for "my app is bug-free":

1. **About your closed test** — how easy recruitment was, what testers used,
   whether their usage matched a real user, and a summary of the feedback.
2. **About your app** — target audience, value proposition, first-year install
   estimate.
3. **About your production readiness** — what changed because of the test, and
   how you decided it was ready.

"Nothing needed changing after 14 days, across these 15 behaviours and these
devices, with the pre-launch report clean" is a complete answer. "No feedback
received" is not.
