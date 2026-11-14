/*
 * tools/midref.c — reference renderer for the MIDI parity harness.
 *
 * Loads a .mid with tml.h and a .sf2 with tsf.h (TinySoundFont v0.9 — the
 * pristine reference in reference/tinysoundfont/) and renders to a stereo
 * 16-bit WAV using the exact example3.c playback loop:
 *   - 64-sample blocks (TSF_RENDER_EFFECTSAMPLEBLOCK) from sample 0
 *   - g_Msec += block * (1000.0 / rate) BEFORE dispatching messages
 *   - dispatch through the example3 switch (PROGRAM_CHANGE with drum
 *     handling on channel 9, NOTE_ON/OFF, PITCH_BEND, CONTROL_CHANGE)
 *   - tsf_render_short for rendering + float->s16 conversion
 *
 * Math layer: tsf.h's TSF_POW/TSF_POWF/TSF_EXPF/TSF_LOG/TSF_TAN/TSF_LOG10
 * macros route to tools/refmath.h — the same deterministic double-double
 * implementation the TS port (packages/fmt-mid/src/refmath.ts) uses —
 * because platform libm rounding is not reproducible across libcs. The
 * reference header is otherwise untouched. Compile with
 * -ffp-contract=off so no expression fuses into FMA.
 *
 * usage: midref <file.mid> <soundfont.sf2> <out.wav> <max-frames> [rate] [gain-db]
 * build: cc -O2 -ffp-contract=off -o /tmp/midref tools/midref.c -Ireference/tinysoundfont -lm
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#include "refmath.h"
#define TSF_POW rm_pow
#define TSF_POWF rm_powf
#define TSF_EXPF rm_expf
#define TSF_LOG rm_log
#define TSF_LOG10 rm_log10
#define TSF_TAN rm_tan
#define TSF_SQRTF sqrtf
#define TSF_SQRT sqrt

#define TSF_IMPLEMENTATION
#include "tsf.h"

#define TML_IMPLEMENTATION
#include "tml.h"

int main(int argc, char **argv)
{
	if (argc < 5) { fprintf(stderr, "usage: midref <file.mid> <font.sf2> <out.wav> <max-frames> [rate] [gain-db]\n"); return 2; }
	int rate = (argc > 5 ? atoi(argv[5]) : 48000);
	double gain = (argc > 6 ? atof(argv[6]) : -10.0);
	int maxFrames = atoi(argv[4]);

	tml_message *msg = tml_load_filename(argv[1]);
	if (!msg) { fprintf(stderr, "[midref] could not load MIDI file\n"); return 1; }
	tsf *f = tsf_load_filename(argv[2]);
	if (!f) { fprintf(stderr, "[midref] could not load SoundFont\n"); return 1; }

	// example3.c main()
	tsf_channel_set_bank_preset(f, 9, 128, 0);
	tsf_set_output(f, TSF_STEREO_INTERLEAVED, rate, (float)gain);

	FILE *out = fopen(argv[3], "wb");
	if (!out) { fprintf(stderr, "[midref] cannot open output\n"); return 1; }
	for (int i = 0; i < 44; i++) fputc(0, out);

	// example3.c AudioCallback loop, capped at maxFrames (64-sample blocks)
	double msec = 0;
	int total = 0;
	short sbuf[64 * 2];
	for (;;)
	{
		int block = 64;
		if (total + block > maxFrames) block = maxFrames - total;
		if (block <= 0) break;

		msec += block * (1000.0 / rate);
		for (; msg && msec >= msg->time; msg = msg->next)
		{
			switch (msg->type)
			{
				case TML_PROGRAM_CHANGE:
					tsf_channel_set_presetnumber(f, msg->channel, msg->program, (msg->channel == 9));
					break;
				case TML_NOTE_ON:
					tsf_channel_note_on(f, msg->channel, msg->key, msg->velocity / 127.0f);
					break;
				case TML_NOTE_OFF:
					tsf_channel_note_off(f, msg->channel, msg->key);
					break;
				case TML_PITCH_BEND:
					tsf_channel_set_pitchwheel(f, msg->channel, msg->pitch_bend);
					break;
				case TML_CONTROL_CHANGE:
					tsf_channel_midi_control(f, msg->channel, msg->control, msg->control_value);
					break;
			}
		}

		tsf_render_short(f, sbuf, block, 0);
		fwrite(sbuf, 2, block * 2, out);
		total += block;
	}

	// WAV header (same layout as tools/xmpref.c)
	fseek(out, 0, SEEK_SET);
	fwrite("RIFF", 1, 4, out);
	unsigned riff = 36 + total * 4; fwrite(&riff, 4, 1, out);
	fwrite("WAVEfmt ", 1, 8, out);
	unsigned fmt = 16; fwrite(&fmt, 4, 1, out);
	short fmtn = 1; fwrite(&fmtn, 2, 1, out);
	short ch = 2; fwrite(&ch, 2, 1, out);
	unsigned r = (unsigned)rate; fwrite(&r, 4, 1, out);
	unsigned byterate = (unsigned)rate * 4; fwrite(&byterate, 4, 1, out);
	short align = 4; fwrite(&align, 2, 1, out);
	short bits = 16; fwrite(&bits, 2, 1, out);
	fwrite("data", 1, 4, out);
	unsigned data = total * 4; fwrite(&data, 4, 1, out);
	fclose(out);
	fprintf(stderr, "[midref] rendered %d frames @ %d Hz (gain %.1f dB)\n", total, rate, gain);
	return 0;
}
