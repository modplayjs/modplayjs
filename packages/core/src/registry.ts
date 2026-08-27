// Plugin registries. One registry each for format/effect/dsp/output plugins.
// Mirrors libxmp's static loader table (load.c:/players/ + add_loaders())
// generalized; lookup by name, first-match format probing.

import type {
  FormatPlugin,
  EffectPlugin,
  DspPlugin,
  OutputPlugin,
} from './types/index';
import { PluginNotFoundError } from './errors';

export class Registries {
  private formats = new Map<string, FormatPlugin>();
  /** Format plugins in registration order — probe order matters. */
  private formatList: FormatPlugin[] = [];
  private effects = new Map<string, EffectPlugin>();
  private effectList: EffectPlugin[] = [];
  private dsps = new Map<string, DspPlugin>();
  private dspList: DspPlugin[] = [];
  private outputs = new Map<string, OutputPlugin>();
  private outputList: OutputPlugin[] = [];

  registerFormat(p: FormatPlugin): void {
    if (this.formats.has(p.name)) throw new PluginNotFoundError(`format '${p.name}' already registered`);
    this.formats.set(p.name, p);
    this.formatList.push(p);
  }

  registerEffect(p: EffectPlugin): void {
    if (this.effects.has(p.name)) throw new PluginNotFoundError(`effect '${p.name}' already registered`);
    this.effects.set(p.name, p);
    this.effectList.push(p);
  }

  registerDsp(p: DspPlugin): void {
    if (this.dsps.has(p.name)) throw new PluginNotFoundError(`dsp '${p.name}' already registered`);
    this.dsps.set(p.name, p);
    this.dspList.push(p);
  }

  registerOutput(p: OutputPlugin): void {
    if (this.outputs.has(p.name)) throw new PluginNotFoundError(`output '${p.name}' already registered`);
    this.outputs.set(p.name, p);
    this.outputList.push(p);
  }

  /** First plugin whose test() passes over the bytes (add_loaders probe parity). */
  formatFor(bytes: Uint8Array): FormatPlugin | null {
    for (const p of this.formatList) {
      if (p.test(bytes)) return p;
    }
    return null;
  }

  /** Registered effects in registration order. */
  effectPlugins(): readonly EffectPlugin[] {
    return this.effectList;
  }

  format(name: string): FormatPlugin {
    const p = this.formats.get(name);
    if (!p) throw new PluginNotFoundError(`no format plugin '${name}'`);
    return p;
  }

  effect(name: string): EffectPlugin {
    const p = this.effects.get(name);
    if (!p) throw new PluginNotFoundError(`no effect plugin '${name}'`);
    return p;
  }

  dsp(name: string): DspPlugin {
    const p = this.dsps.get(name);
    if (!p) throw new PluginNotFoundError(`no dsp plugin '${name}'`);
    return p;
  }

  output(name: string): OutputPlugin {
    const p = this.outputs.get(name);
    if (!p) throw new PluginNotFoundError(`no output plugin '${name}'`);
    return p;
  }
}
