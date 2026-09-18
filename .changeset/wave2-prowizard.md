---
'@modplayjs/fmt-prowizard': minor
---

Add ProWizard packed-MOD depackers: 20 packers ported from libxmp's
prowizard library (ProPacker 1.0/2.1/3.0, The Player 4.x/5.0a/6.0a,
Tracker Packer v1/v2/v3, UNIC Tracker id/noid/id0/2, NoisePacker
v1/v2/v3, AC1D, Digital Illusions, Eureka, FC-M, Fuchs, Heatseeker,
Hornet, Kefrens Sound Machine, Module Protector id/noID, SKYT, Wanton,
XANN, Zen). Each depacker converts packed files to standard 31-sample
M.K. MOD bytes parsed by the shared MOD core. Verified against libxmp's
own golden module dumps (27 fixtures PASS) and 66 fuzzer fixtures
rejected without crashes.
