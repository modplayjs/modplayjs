/* genmixervol: dump per-frame finalvol stream (compare-mixer-data format +
 * finalvol column) for volume-pipeline comparison.
 * usage: genmixervol module out.data maxFrames
 * SPDX-License-Identifier: BSD-3-Clause (harness, project-original) */
#include <stdio.h>
#include <stdlib.h>
#include "src/player.h"
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
			fprintf(f, "%d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d\n",
				fi.time, fi.row, fi.frame, i, xc->info_period,
				vi->note, vi->ins, vi->vol, vi->pan, vi->pos0,
				vi->filter.cutoff, vi->filter.resonance,
				xc->info_finalvol, vi->old_vl, vi->old_vr,
				vi->sleft, vi->sright);
		}
	}
	fclose(f);
	xmp_end_player(opaque);
	xmp_free_context(opaque);
	return 0;
}
