/* genmixerpos: dump per-frame FULL-PRECISION voice positions (pos/pos0)
 * for chunk-boundary parity debugging. Same iteration order as
 * gen_mixer_data.c (all virtual channels per frame).
 * usage: genmixerpos module out.txt maxFrames
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include "src/player.h"  /* compile with -Ireference/libxmp */
#include "src/mixer.h"
#include "src/virtual.h"
#include <xmp.h>

static int map_channel(struct player_data *p, int chn)
{
	int voc;

	if ((uint32)chn >= p->virt.virt_channels)
		return -1;

	voc = p->virt.virt_channel[chn].map;

	if ((uint32)voc >= p->virt.maxvoc)
		return -1;

	return voc;
}

int main(int argc, char **argv)
{
	xmp_context opaque;
	struct context_data *ctx;
	struct player_data *p;
	struct channel_data *xc;
	struct mixer_voice *vi;
	struct xmp_frame_info fi;
	int i, voc, max_channels, frames;
	FILE *f;

	opaque = xmp_create_context();
	if (xmp_load_module(opaque, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
	xmp_start_player(opaque, 48000, 0);
	xmp_set_player(opaque, XMP_PLAYER_MIX, 100);

	ctx = (struct context_data *)opaque;
	p = &ctx->p;
	max_channels = p->virt.virt_channels;
	f = fopen(argv[2], "w");
	frames = atoi(argv[3]);

	while (frames-- > 0) {
		xmp_play_frame(opaque);
		xmp_get_frame_info(opaque, &fi);
		if (fi.loop_count > 0) break;
		for (i = 0; i < max_channels; i++) {
			xc = &p->xc_data[i];
			voc = map_channel(p, i);
			if (voc < 0 || TEST_NOTE(NOTE_SAMPLE_END))
				continue;
			vi = &p->virt.voice_array[voc];
			fprintf(f, "%d %d %d %d %.9f %.9f %d %d\n",
				fi.time, fi.row, fi.frame, i,
				vi->pos, vi->pos0,
				(int)vi->ins, (int)vi->vol);
		}
	}
	fclose(f);
	xmp_end_player(opaque);
	xmp_free_context(opaque);
	return 0;
}
