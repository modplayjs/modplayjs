/* Render a module to stereo s16 WAV via libopenmpt (OpenMPT truth), capped. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libopenmpt/libopenmpt.h>
#include <stdint.h>
#include <libopenmpt/libopenmpt_stream_callbacks_file.h>

static void put_u32(FILE *f, unsigned v) { fwrite(&v, 4, 1, f); }
static void put_u16(FILE *f, unsigned v) { unsigned short s = v; fwrite(&s, 2, 1, f); }

int main(int argc, char **argv) {
    if (argc < 4) { fprintf(stderr, "usage: %s <mod> <out.wav> <frames>\n", argv[0]); return 1; }
    FILE *in = fopen(argv[1], "rb");
    if (!in) return 1;
    openmpt_stream_callbacks cb = openmpt_stream_get_file_callbacks();
    openmpt_module *m = openmpt_module_create2(cb, in, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    fclose(in);
    if (!m) { fprintf(stderr, "load failed\n"); return 1; }

    int rate = 48000;
    
    long cap = atol(argv[3]);
    FILE *out = fopen(argv[2], "wb");
    fwrite("RIFF", 1, 4, out);
    put_u32(out, 0);
    fwrite("WAVEfmt ", 1, 8, out);
    put_u32(out, 16);
    put_u16(out, 1); put_u16(out, 2);
    put_u32(out, rate); put_u32(out, rate * 4);
    put_u16(out, 4); put_u16(out, 16);
    fwrite("data", 1, 4, out);
    put_u32(out, 0);

    const int CHUNK = 512;
    int16_t buf[CHUNK * 2];
    long frames = 0;
    while (frames < cap) {
        int n = openmpt_module_read_interleaved_stereo(m, rate, CHUNK, buf);
        if (n <= 0) break;
        long take = n < (cap - frames) ? n : (cap - frames);
        fwrite(buf, 2, take * 2, out);
        frames += take;
        if (n < CHUNK) break;
    }
    long bytes = frames * 4;
    fseek(out, 4, SEEK_SET); put_u32(out, 36 + bytes);
    fseek(out, 40, SEEK_SET); put_u32(out, bytes);
    fclose(out);
    fprintf(stderr, "[ompt] rendered %ld frames\n", frames);
    openmpt_module_destroy(m);
    return 0;
}
