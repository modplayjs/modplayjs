/* xmpchmask: per-channel oracle render at 48 kHz with an arbitrary mute mask.
 * usage: xmpchmask <module> <out.raw> <mask e.g. 1100 = keep ch0,ch1> <maxFrames>
 * Writes interleaved stereo s16 (4 bytes/frame).
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <xmp.h>

int main(int argc, char **argv) {
  if (argc < 5) {
    fprintf(stderr, "usage: %s <module> <out.raw> <mask> <maxFrames>\n", argv[0]);
    return 2;
  }
  xmp_context ctx = xmp_create_context();
  if (xmp_load_module(ctx, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
  if (xmp_start_player(ctx, 48000, 0) < 0) { fprintf(stderr, "start fail\n"); return 1; }

  int maxFrames = atoi(argv[4]);
  for (int c = 0; c < XMP_MAX_CHANNELS; ++c) {
    char keep = (c < (int)strlen(argv[3])) ? argv[3][c] : '0';
    xmp_channel_mute(ctx, c, keep != '1');
  }

  FILE *f = fopen(argv[2], "wb");
  if (!f) return 1;
  static short buf[1024 * 2];
  int frames = 0;
  while (frames < maxFrames) {
    int want = maxFrames - frames;
    if (want > 1024) want = 1024;
    if (xmp_play_buffer(ctx, buf, want * 4, 0) != 0) break;
    fwrite(buf, 1, (size_t)want * 4, f);
    frames += want;
  }
  fclose(f);
  fprintf(stderr, "wrote %d frames mask=%s\n", frames, argv[3]);
  xmp_end_player(ctx);
  xmp_release_module(ctx);
  xmp_free_context(ctx);
  return 0;
}
