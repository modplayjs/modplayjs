/*
 * tools/xmpref.c — reference renderer for the parity harness.
 *
 * Loads a module with C libxmp and renders it to a 48 kHz stereo 16-bit
 * WAV via xmp_play_buffer, capped at a frame count.
 *
 * usage: xmpref <module> <out.wav> <max-frames>
 * link:  cc -O2 -o xmpref xmpref.c libxmp4.a -I<libxmp include> -lm
 * (libxmp4.a: build reference/libxmp sources, `ar rcs libxmp4.a *.o`)
 */
#include <stdio.h>
#include <stdlib.h>
#include <xmp.h>

int main(int argc, char **argv) {
  xmp_context opaque = xmp_create_context();
  if (xmp_load_module(opaque, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
  if (xmp_start_player(opaque, 48000, 0) < 0) { fprintf(stderr, "start fail\n"); return 1; }
  int maxFrames = atoi(argv[3]);
  const int CHUNK = 15000; /* bytes per play_buffer: 7500 stereo 16-bit frames */
  short buf[CHUNK / 2];
  FILE *f = fopen(argv[2], "wb");
  for (int i = 0; i < 44; i++) fputc(0, f);
  int total = 0;
  while (total < maxFrames * 4) {
    if (xmp_play_buffer(opaque, buf, CHUNK, 0) != 0) break;
    int left = maxFrames * 4 - total;
    int bytes = CHUNK < left ? CHUNK : left;
    fwrite(buf, 1, bytes, f);
    total += bytes;
  }
  fseek(f, 0, SEEK_SET);
  fwrite("RIFF", 1, 4, f);
  unsigned riff = 36 + total; fwrite(&riff, 4, 1, f);
  fwrite("WAVEfmt ", 1, 8, f);
  unsigned fmt = 16; fwrite(&fmt, 4, 1, f);
  short fmtn = 1; fwrite(&fmtn, 2, 1, f);
  short ch = 2; fwrite(&ch, 2, 1, f);
  unsigned rate = 48000; fwrite(&rate, 4, 1, f);
  unsigned byterate = 48000 * 4; fwrite(&byterate, 4, 1, f);
  short align = 4; fwrite(&align, 2, 1, f);
  short bits = 16; fwrite(&bits, 2, 1, f);
  fwrite("data", 1, 4, f);
  fwrite(&total, 4, 1, f);
  fclose(f);
  fprintf(stderr, "[ref] rendered %d frames\n", total / 4);
  return 0;
}
