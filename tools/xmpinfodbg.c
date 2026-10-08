/* xmpinfodbg: print frame info + first samples around a tick.
 * usage: xmpinfodbg module dbgFrame framesPerTick
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include <xmp.h>

int main(int argc, char **argv) {
  xmp_context ctx = xmp_create_context();
  if (xmp_load_module(ctx, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
  xmp_start_player(ctx, 48000, 0);
  int dbgFrame = atoi(argv[2]);
  int tick = atoi(argv[3]);
  short buf[2 * 960];
  int frame = 0;
  int calls = 0;
  while (frame < dbgFrame + 4 * tick) {
    int n = xmp_play_buffer(ctx, buf, 2 * 960 * 2, 0);
    if (n < 0) { fprintf(stderr, "play_buffer < 0 at frame %d\n", frame); break; }
    int got = 2 * 960; /* play_buffer fills the whole size buffer */
    frame += got;
    if (abs(frame / tick - dbgFrame / tick) <= 2) {
      struct xmp_frame_info fi;
      xmp_get_frame_info(ctx, &fi);
      fprintf(stderr, "t %d ord %d row %d speed %d bpm %d time %d first %d %d %d %d\n",
              frame / tick, fi.pos, fi.row, fi.speed, fi.bpm, (int)fi.time,
              buf[0], buf[1], buf[2], buf[3]);
    }
  }
  xmp_stop_module(ctx);
  xmp_free_context(ctx);
  return 0;
}
