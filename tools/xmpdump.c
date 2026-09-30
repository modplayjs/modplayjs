// tools/xmpdump.c — C-side ModuleData dumper matching tools/xmpdump.mjs.
// Build: cc -O2 -o /tmp/xmpdump tools/xmpdump.c -I<libxmp>/include -l xmp
// (or link against /tmp/libxmp4.a). Usage: xmpdump <module> > dump.txt
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <xmp.h>
#include "../src/common.h"	/* extra_sample_data: sus/sue live in xxs->extra */

static unsigned long long fnv(const unsigned char *p, size_t n) {
	unsigned long long h = 2166136261ULL;
	size_t i;
	for (i = 0; i < n; i++) { h ^= p[i]; h *= 16777619ULL; }
	return h;
}

int main(int argc, char **argv)
{
	xmp_context c;
	struct xmp_module *m;
	struct xmp_module_info mi;
	int i, j, k;

	if (argc < 2) { fprintf(stderr, "usage: %s <module>\n", argv[0]); return 1; }
	c = xmp_create_context();
	if (xmp_load_module(c, argv[1]) < 0) { fprintf(stderr, "load fail\n"); return 1; }
	xmp_get_module_info(c, &mi);
	m = mi.mod;

	printf("TYPE %s\n", m->type);
	printf("TITLE %s\n", m->name);
	printf("H len=%d chn=%d pat=%d ins=%d smp=%d spd=%d bpm=%d rst=%d gvl=%d\n",
		m->len, m->chn, m->pat, m->ins, m->smp, m->spd, m->bpm, m->rst, m->gvl);
	/* struct xmp_module has no mvol/quirk etc. — the JS side prints them
	 * from ModuleData; approximate with the common defaults so the
	 * loader-parity diff focuses on loader-owned fields. */
	{
		/* Internal module_data fields (quirk/flow/readev/comment/etc.)
		 * aren't in the public xmp_module — reach them via the context. */
		const struct context_data *ctx = (const struct context_data *)c;
		const struct module_data *md = &ctx->m;
		printf("M mvolbase=%d mvol=%d gvolbase=%d gvol=%d volbase=%d c4rate=%d quirk=%08x flow=%08x readev=%d period=%d defpan=%d smpctl=%d\n",
			md->mvolbase, md->mvol, md->gvolbase, md->gvol, md->volbase,
			md->c4rate, (unsigned)md->quirk, (unsigned)md->flow_mode,
			md->read_event_type, md->period_type, md->defpan, md->smpctl);
		if (md->comment)
			printf("COMMENT %s\n", md->comment);
		else
			printf("COMMENT \n");
	}
	for (i = 0; i < m->len; i++) printf("ORD %d %02x\n", i, m->xxo[i]);
	for (i = 0; i < m->chn; i++)
		printf("CHN %d pan=%04x vol=%d\n", i, m->xxc[i].pan, m->xxc[i].vol);

	for (i = 0; i < m->ins; i++) {
		struct xmp_instrument *xxi = &m->xxi[i];
		printf("INS %d name=%s nsm=%d vol=%d rls=%d\n", i, xxi->name, xxi->nsm, xxi->vol, xxi->rls);
		for (k = 0; k < 121; k++) {
			if (xxi->map[k].ins != 0 || xxi->map[k].xpo != 0)
				printf("INSMAP %d %d ins=%d xpo=%d\n", i, k, xxi->map[k].ins, xxi->map[k].xpo);
		}
		struct xmp_envelope *envs[3] = { &xxi->aei, &xxi->pei, &xxi->fei };
		const char *tags[3] = { "aei", "pei", "fei" };
		for (j = 0; j < 3; j++) {
			struct xmp_envelope *e = envs[j];
			printf("ENV %s flg=%02x npt=%d scl=%d sus=%d sue=%d lps=%d lpe=%d\n",
				tags[j], e->flg, e->npt, e->scl, e->sus, e->sue, e->lps, e->lpe);
			for (k = 0; k < e->npt; k++)
				printf("ENVPT %s %d %d\n", tags[j], e->data[k * 2], e->data[k * 2 + 1]);
		}
		for (j = 0; j < xxi->nsm && j < 32; j++) {
			struct xmp_subinstrument *s = &xxi->sub[j];
			printf("SUB %d/%d vol=%d gvl=%d pan=%08x xpo=%d fin=%d sid=%d ifc=%d ifr=%d vwf=%d vde=%d vra=%d vsw=%d rvv=%d nna=%d dct=%d dca=%d\n",
				i, j, s->vol, s->gvl, s->pan, s->xpo, s->fin, s->sid, s->ifc, s->ifr,
				s->vwf, s->vde, s->vra, s->vsw, s->rvv, s->nna, s->dct, s->dca);
		}
	}

	for (i = 0; i < m->smp; i++) {
		struct xmp_sample *s = &m->xxs[i];
		/* xxs in the context is libxmp's internal sample array: reach
		 * the extra_sample_data (sus/sue) via ctx->m.xtra (parallel
		 * array, one entry per sample). */
		const struct context_data *cd = (const struct context_data *)c;
		const struct module_data *md2 = &cd->m;
		const struct extra_sample_data *x = &md2->xtra[i];
		/* FNV over converted PCM: libxmp keeps xxs->data as loaded
		 * (delta-decoded, 8-bit or 16-bit). */
		size_t bytes = s->len * ((s->flg & XMP_SAMPLE_16BIT) ? 2 : 1) *
			((s->flg & XMP_SAMPLE_STEREO) ? 2 : 1);
		printf("SMP %d name=%s len=%d lps=%d lpe=%d flg=%02x fnv=%016llx\n",
			i, s->name, s->len, s->lps, s->lpe, s->flg & 0xff,
			(unsigned long long)fnv((const unsigned char *)s->data, bytes));
		printf("SMPX %d sus=%d sue=%d\n", i, x ? x->sus : 0, x ? x->sue : 0);
	}

	for (i = 0; i < m->pat; i++) {
		struct xmp_pattern *p = m->xxp[i];
		printf("PAT %d rows=%d\n", i, p->rows);
		for (int r = 0; r < p->rows; r++) {
			for (j = 0; j < m->chn; j++) {
				struct xmp_event *e = &m->xxt[p->index[j]]->event[r];
				if (e->note || e->ins || e->vol || e->fxt || e->fxp || e->f2t || e->f2p)
					printf("EV %d %d %d n=%02x i=%02x v=%02x f=%02x p=%02x f2=%02x p2=%02x\n",
						i, r, j, e->note, e->ins, e->vol, e->fxt, e->fxp, e->f2t, e->f2p);
			}
		}
	}

	xmp_release_module(c);
	xmp_free_context(c);
	return 0;
}
