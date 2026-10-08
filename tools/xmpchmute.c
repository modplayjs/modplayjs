/* xmpchmute: oracle per-channel render (mute all but one channel).
 * usage: xmpchmute module out.raw keepChannel maxFrames
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include <xmp.h>

int main(int argc, char **argv) {
  xmp_context ctx = xmp_create_context();
  if (xmp_load_module(ctx, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
  xmp_start_player(ctx, 48000, 0);
  int keep = atoi(argv[3]);
  for (int c = 0; c < 4; ++c) xmp_channel_mute(ctx, c, c != keep);
  FILE *f = fopen(argv[2], "wb");
  int maxFrames = atoi(argv[4]);
  short buf[2 * 960];
  int total = 0;
  while (total < maxFrames) {
    if (xmp_play_buffer(ctx, buf, 2 * 960 * 2, 0) != 0) break;
    fwrite(buf, 1, 2 * 960 * 2, f);
    total += 2 * 960;
  }
  fclose(f);
  fprintf(stderr, "wrote %d frames ch%d\n", total, keep);
  xmp_stop_module(ctx);
  xmp_free_context(ctx);
  return 0;
}
