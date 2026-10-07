/* xmpseekref: oracle for seek — load, seek via xmp_seek_time_frame, render.
 * usage: xmpseekref module out.wav seek-sec render-sec
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <xmp.h>

static void wav_header(FILE *f, unsigned frames) {
  unsigned bytes = frames * 4;
  fwrite("RIFF", 1, 4, f);
  unsigned riff = 36 + bytes;
  fwrite(&riff, 4, 1, f);
  fwrite("WAVEfmt ", 1, 8, f);
  unsigned fmt = 16;
  fwrite(&fmt, 4, 1, f);
  short pcm = 1;
  fwrite(&pcm, 2, 1, f);
  short ch = 2;
  fwrite(&ch, 2, 1, f);
  unsigned rate = 48000;
  fwrite(&rate, 4, 1, f);
  unsigned brate = rate * 4;
  fwrite(&brate, 4, 1, f);
  short align = 4;
  fwrite(&align, 2, 1, f);
  short bits = 16;
  fwrite(&bits, 2, 1, f);
  fwrite("data", 1, 4, f);
  fwrite(&bytes, 4, 1, f);
}

int main(int argc, char **argv) {
  if (argc < 5) { fprintf(stderr, "usage: %s module out.wav seek-sec render-sec\n", argv[0]); return 1; }
  xmp_context ctx = xmp_create_context();
  if (xmp_load_module(ctx, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
  xmp_start_player(ctx, 48000, 0);
  int seekMs = (int)(atof(argv[3]) * 1000);
  int ret = xmp_seek_time_frame(ctx, seekMs);
  if (ret < 0) { fprintf(stderr, "seek fail %d\n", ret); return 1; }
  fprintf(stderr, "seek ok, pos %d\n", ret);
  FILE *f = fopen(argv[2], "wb");
  unsigned frames = (unsigned)(atof(argv[4]) * 48000);
  wav_header(f, frames);
  unsigned written = 0;
  while (written < frames) {
    struct xmp_frame_info fi;
    int n = xmp_play_frame(ctx);
    if (n < 0) { fprintf(stderr, "play_frame < 0 at %u\n", written); break; }
    xmp_get_frame_info(ctx, &fi);
    if (fi.buffer_size == 0) { fprintf(stderr, "buffer_size 0 at %u\n", written); break; }
    unsigned got = fi.buffer_size / 2;
    if (got > frames - written) got = frames - written;
    fwrite(fi.buffer, 1, got * 4, f);
    written += got;
  }
  fclose(f);
  fprintf(stderr, "wrote %u frames\n", written);
  xmp_stop_module(ctx);
  xmp_free_context(ctx);
  return 0;
}
