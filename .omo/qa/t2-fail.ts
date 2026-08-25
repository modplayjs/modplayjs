// T2 QA FAILURE case: a FormatPlugin literal MISSING the required `test`
// method — must produce a tsc error naming the missing member.
import type { FormatPlugin, LoadCtx, ModuleData, Core } from '@modplayjs/core';

const badFormat: FormatPlugin = {
  name: 'bad-format',
  load(_bytes: Uint8Array, _ctx: LoadCtx): ModuleData {
    throw new Error('stub');
  },
  readEvent(_core: Core, _chn: number, _row: number): void { /* noop */ },
};

export { badFormat };