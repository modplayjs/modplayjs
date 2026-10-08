/* xmpframedbg: per-frame oracle — process one frame, print state.
 * usage: xmpframedbg module maxTick dbgFrom dbgTo
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include <xmp.h>

int main(int argc, char **argv) {
  xmp_context ctx = xmp_create_context();
  if (xmp_load_module(ctx, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
  xmp_start_player(ctx, 48000, 0);
  int maxTick = atoi(argv[2]);
  int dbgFrom = atoi(argv[3]);
  int dbgTo = atoi(argv[4]);
  struct xmp_frame_info fi;
  for (int t = 0; t < maxTick; ++t) {
    int ret = xmp_play_frame(ctx);
    if (ret < 0) break;
    xmp_get_frame_info(ctx, &fi);
    if (t >= dbgFrom - 2 && t <= dbgTo + 2) {
      fprintf(stderr, "tick %d ord %d row %d frame %d speed %d bpm %d time %d virt_used %d\n",
              t, fi.pos, fi.row, fi.frame, fi.speed, fi.bpm, (int)fi.time, fi.virt_used);
      for (int c = 0; c < 4; ++c) {
        fprintf(stderr, "   ch%d: period %d note %d ins %d vol %d pan %d\n",
                c, fi.channel_info[c].period, fi.channel_info[c].note,
                fi.channel_info[c].instrument, fi.channel_info[c].volume,
                fi.channel_info[c].pan);
      }
    }
  }
  xmp_stop_module(ctx);
  xmp_free_context(ctx);
  return 0;
}
