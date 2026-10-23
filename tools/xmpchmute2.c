/* xmpchmute2: per-channel oracle render at 48 kHz, correct frame accounting.
 * usage: xmpchmute2 <module> <out.raw> <keepChannel|all> <maxFrames>
 * Writes interleaved stereo s16 (4 bytes/frame).
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <xmp.h>

int main(int argc, char **argv) {
  if (argc < 5) {
    fprintf(stderr, "usage: %s <module> <out.raw> <keep|all> <maxFrames>\n", argv[0]);
    return 2;
  }
  xmp_context ctx = xmp_create_context();
  if (xmp_load_module(ctx, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
  if (xmp_start_player(ctx, 48000, 0) < 0) { fprintf(stderr, "start fail\n"); return 1; }

  int maxFrames = atoi(argv[4]);
  if (strcmp(argv[3], "all") != 0) {
    int keep = atoi(argv[3]);
    for (int c = 0; c < XMP_MAX_CHANNELS; ++c)
      xmp_channel_mute(ctx, c, c != keep);
  }

  FILE *f = fopen(argv[2], "wb");
  if (!f) return 1;
  /* 1024 stereo frames per call; xmp_play_buffer takes a byte count. */
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
  fprintf(stderr, "wrote %d frames (%.3fs)\n", frames, frames / 48000.0);
  xmp_end_player(ctx);
  xmp_release_module(ctx);
  xmp_free_context(ctx);
  return 0;
}
