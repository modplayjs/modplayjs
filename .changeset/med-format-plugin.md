---
'@modplayjs/fmt-med': minor
'@modplayjs/core': minor
---

Add MED/OctaMED (.med) format family: MMD0/MMD1/MMDC (MED 2.10 / OctaMED),
MMD2/MMD3 (OctaMED Soundstudio), and MED2/MED3/MED4 song formats, ported
from libxmp mmd_common.c, mmd1_load.c, mmd3_load.c, med2/3/4_load.c.

Core gains MED runtime support: READ_EVENT_MED event reader (read_event_med),
MED synth wavetable instruments + hold/decay (med_extras.c), FX_VIBRATO2 /
FX_MED_RETRIG / FX_MED_HOLD effects, MED retrigger-delay handling in
check_delay, and the MED row_limit (3200) in the scanner. LoadCtx gains an
externalInstrument resolver for song formats that reference sample files
(med_load_external_instrument).
