// T2 QA: dummy object literals satisfying each plugin interface.
import type {
  Core, FormatPlugin, EffectPlugin, DspPlugin, OutputPlugin,
  LoadCtx, ModuleData,
} from '@modplayjs/core';

declare const core: Core;

const dummyFormat: FormatPlugin = {
  name: 'dummy-format',
  test(bytes: Uint8Array): boolean { return bytes.length > 4; },
  load(_bytes: Uint8Array, _ctx: LoadCtx): ModuleData {
    throw new Error('stub');
  },
  readEvent(_core: Core, _chn: number, _row: number): void { /* noop */ },
};

const dummyEffect: EffectPlugin = {
  name: 'dummy-effect',
  onRow(_core: Core, _chn: number, _ev: never): void { /* noop */ },
  onTick(_core: Core, _chn: number): void { /* noop */ },
};

const dummyDsp: DspPlugin = {
  name: 'dummy-dsp',
  channels: 4,
  renderFrame(_core: Core, _out: Float32Array, _ticks: number): void { /* noop */ },
  reset(): void { /* noop */ },
};

const dummyOutput: OutputPlugin = {
  name: 'dummy-output',
  start(_core: Core): void { /* noop */ },
  stop(): void { /* noop */ },
};

// All four type-check as their interface types.
export { dummyFormat, dummyEffect, dummyDsp, dummyOutput };