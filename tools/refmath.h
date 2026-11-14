/*
 * tools/refmath.h — deterministic reference math layer for the MIDI
 * parity oracle (tools/midref.c).
 *
 * Why: tsf.h's transcendental macros (TSF_POW/TSF_POWF/TSF_EXPF/TSF_LOG/
 * TSF_TAN/TSF_LOG10) call the platform libm, whose rounding differs
 * between glibc and every other implementation (measured: pow(2,y)
 * differs from V8's Math.pow by up to 11 double ulps in 50% of cases).
 * A TypeScript port cannot match one particular libm, so BOTH sides pin
 * the math layer to this implementation (C here, its 1:1 TS port in
 * packages/fmt-mid/src/refmath.ts).
 *
 * Every operation used is IEEE-754 binary64 +, -, *, / or exact scaling
 * by powers of two, so the C and the TS port produce bit-identical
 * results on any IEEE platform. Compile with -ffp-contract=off (no FMA
 * contraction). Accuracy: double-double (~100 bits) internally, i.e.
 * correctly rounded after conversion to double except at exact midpoints.
 *
 * The TML/TSF reference code is untouched: tsf.h's own extension macros
 * route its math here.
 */
#ifndef REF_MATH_H
#define REF_MATH_H

#include <math.h> /* ldexp (exact) only */

typedef struct { double hi, lo; } rm_dd;

static rm_dd rm_dd_make(double hi, double lo) { rm_dd r; r.hi = hi; r.lo = lo; return r; }
static rm_dd rm_dd_neg(rm_dd a) { return rm_dd_make(-a.hi, -a.lo); }

/* Error-free transforms (Knuth two-sum, Dekker two-product). */
static void rm_two_sum(double a, double b, double *s, double *e) {
	*s = a + b;
	double bb = *s - a;
	*e = (a - (*s - bb)) + (b - bb);
}

static void rm_two_prod(double a, double b, double *p, double *e) {
	const double SPLIT = 134217729.0; /* 2^27 + 1 */
	double ta = SPLIT * a, tb = SPLIT * b;
	double ahi = ta - (ta - a), alo = a - ahi;
	double bhi = tb - (tb - b), blo = b - bhi;
	*p = a * b;
	*e = ((ahi * bhi - *p) + ahi * blo + alo * bhi) + alo * blo;
}

static rm_dd rm_dd_add(rm_dd a, rm_dd b) {
	double s, e, s2, e2;
	rm_two_sum(a.hi, b.hi, &s, &e);
	e += a.lo + b.lo;
	rm_two_sum(s, e, &s2, &e2);
	return rm_dd_make(s2, e2);
}

static rm_dd rm_dd_mul(rm_dd a, rm_dd b) {
	double p, e, s2, e2;
	rm_two_prod(a.hi, b.hi, &p, &e);
	e += a.hi * b.lo + a.lo * b.hi;
	rm_two_sum(p, e, &s2, &e2);
	return rm_dd_make(s2, e2);
}

static rm_dd rm_dd_div(rm_dd a, rm_dd b) {
	/* Two refinement steps of q = a/b in double-double. */
	double q1 = a.hi / b.hi;
	rm_dd r = rm_dd_add(a, rm_dd_neg(rm_dd_mul(rm_dd_make(q1, 0), b)));
	double q2 = r.hi / b.hi;
	rm_dd q = rm_dd_add(rm_dd_make(q1, 0), rm_dd_make(q2, 0));
	r = rm_dd_add(a, rm_dd_neg(rm_dd_mul(q, b)));
	double q3 = r.hi / b.hi;
	return rm_dd_add(q, rm_dd_make(q3, 0));
}

static rm_dd rm_dd_scalbn(rm_dd a, int k) {
	return rm_dd_make(ldexp(a.hi, k), ldexp(a.lo, k));
}

/* Round to nearest, ties to even (C nearbyint rounding mode). */
static double rm_rint(double x) {
	double f = floor(x), d = x - f;
	if (d > 0.5) return f + 1.0;
	if (d < 0.5) return f;
	return (f - 2.0 * floor(f / 2.0) == 0.0) ? f : f + 1.0;
}

/* ln 2 = RM_LN2.hi + RM_LN2.lo (correctly rounded split) */
static const rm_dd RM_LN2 = { 0x1.62e42fefa39efp-1, 0x1.abc9e3b39803fp-56 };
/* pi/2 = RM_PI_2.hi + RM_PI_2.lo */
static const rm_dd RM_PI_2 = { 0x1.921fb54442d18p+0, 0x1.1a62633145c07p-54 };

/* exp(x) in double-double. |r| <= ln2/2 after reduction. */
static rm_dd rm_exp_dd(rm_dd x) {
	double k = rm_rint(x.hi / RM_LN2.hi);
	rm_dd r = rm_dd_add(x, rm_dd_mul(rm_dd_make(-k, 0), RM_LN2));
	rm_dd sum = rm_dd_make(1, 0), term = rm_dd_make(1, 0);
	for (int n = 1; n <= 25; n++) {
		term = rm_dd_div(rm_dd_mul(term, r), rm_dd_make((double)n, 0));
		sum = rm_dd_add(sum, term);
		if (n > 8 && (term.hi < 0x1p-105 && term.hi > -0x1p-105)) break;
	}
	return rm_dd_scalbn(sum, (int)k);
}

/* log(x) in double-double, x > 0. */
static rm_dd rm_log_dd(rm_dd x) {
	double m = x.hi;
	int e = 0;
	while (m >= 1.0) { m *= 0.5; e++; }
	while (m < 0.5) { m *= 2.0; e--; }
	rm_dd mx = rm_dd_scalbn(x, -e);
	/* log(m) = 2*atanh((m-1)/(m+1)) */
	rm_dd z = rm_dd_div(rm_dd_add(mx, rm_dd_make(-1, 0)), rm_dd_add(mx, rm_dd_make(1, 0)));
	rm_dd z2 = rm_dd_mul(z, z);
	rm_dd term = z, sum = z;
	for (int n = 1; n <= 40; n++) {
		term = rm_dd_mul(term, z2);
		sum = rm_dd_add(sum, rm_dd_div(term, rm_dd_make(2.0 * (double)n + 1.0, 0)));
		if (term.hi < 0x1p-105 && term.hi > -0x1p-105) break;
	}
	return rm_dd_add(rm_dd_mul(rm_dd_make((double)e, 0), RM_LN2), rm_dd_scalbn(sum, 1));
}

static rm_dd rm_sin_dd(rm_dd x) {
	rm_dd x2 = rm_dd_mul(x, x);
	rm_dd term = x, sum = x;
	for (int n = 1; n <= 30; n++) {
		term = rm_dd_div(rm_dd_mul(term, x2), rm_dd_make((2.0 * n) * (2.0 * n + 1.0), 0));
		sum = (n & 1) ? rm_dd_add(sum, rm_dd_neg(term)) : rm_dd_add(sum, term);
		if (n > 8 && (term.hi < 0x1p-105 && term.hi > -0x1p-105)) break;
	}
	return sum;
}

static rm_dd rm_cos_dd(rm_dd x) {
	rm_dd x2 = rm_dd_mul(x, x);
	rm_dd term = rm_dd_make(1, 0), sum = rm_dd_make(1, 0);
	for (int n = 1; n <= 30; n++) {
		term = rm_dd_div(rm_dd_mul(term, x2), rm_dd_make((2.0 * n - 1.0) * (2.0 * n), 0));
		sum = (n & 1) ? rm_dd_add(sum, rm_dd_neg(term)) : rm_dd_add(sum, term);
		if (n > 8 && (term.hi < 0x1p-105 && term.hi > -0x1p-105)) break;
	}
	return sum;
}

/* tan(x) in double-double (reduction mod pi/2). */
static rm_dd rm_tan_dd(rm_dd x) {
	double n = rm_rint(x.hi / RM_PI_2.hi);
	rm_dd r = rm_dd_add(x, rm_dd_mul(rm_dd_make(-n, 0), RM_PI_2));
	rm_dd t = rm_dd_div(rm_sin_dd(r), rm_cos_dd(r));
	int q = (int)(n - 2.0 * floor(n / 2.0));
	if (q == 0) return t;
	return rm_dd_div(rm_dd_make(1, 0), rm_dd_neg(t));
}

static double rm_exp(double x) { return rm_exp_dd(rm_dd_make(x, 0)).hi; }
static double rm_log(double x) { return rm_log_dd(rm_dd_make(x, 0)).hi; }
static double rm_tan(double x) { return rm_tan_dd(rm_dd_make(x, 0)).hi; }
static double rm_log10(double x) {
	rm_dd l10 = rm_log_dd(rm_dd_make(10, 0));
	return rm_dd_div(rm_log_dd(rm_dd_make(x, 0)), l10).hi;
}

/* pow(x,y) = exp(y*log(x)) with the special cases tsf.h needs. */
static double rm_pow(double x, double y) {
	if (y == 0.0) return 1.0;
	if (x == 1.0) return 1.0;
	if (x == 0.0) return (y > 0.0) ? 0.0 : INFINITY;
	if (x < 0.0) {
		double yi = rm_rint(y);
		if (yi != y) return NAN;
		double p = rm_exp_dd(rm_dd_mul(rm_dd_make(y, 0), rm_log_dd(rm_dd_make(-x, 0)))).hi;
		double parity = yi - 2.0 * floor(yi / 2.0);
		return (parity == 0.0) ? p : -p;
	}
	return rm_exp_dd(rm_dd_mul(rm_dd_make(y, 0), rm_log_dd(rm_dd_make(x, 0)))).hi;
}

static float rm_powf(float x, float y) { return (float)rm_pow((double)x, (double)y); }
static float rm_expf(float x) { return (float)rm_exp((double)x); }

#endif /* REF_MATH_H */
