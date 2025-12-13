import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookManager } from '../hooks/HookManager';

describe('HookManager', () => {
  let hm: HookManager;

  beforeEach(() => {
    hm = new HookManager();
  });

  it('registers and triggers callbacks in order and allows modification', async () => {
    hm.register('test:hook' as any, async (ctx) => {
      ctx.value = (ctx.value || 0) + 1;
      return ctx;
    });

    hm.register('test:hook' as any, async (ctx) => {
      ctx.value = ctx.value * 2;
      return ctx;
    });

    const result = await hm.trigger('test:hook' as any, { value: 2 });
    expect(result.value).toBe(6); // (2+1)*2
  });

  it('stopPropagation stops further callbacks', async () => {
    hm.register('stop:hook' as any, async (ctx) => {
      ctx.value = 1;
      ctx.stopPropagation = true;
      return ctx;
    });

    hm.register('stop:hook' as any, async (ctx) => {
      ctx.value = 999; // should not be called
      return ctx;
    });

    const result = await hm.trigger('stop:hook' as any, { value: 0 });
    expect(result.value).toBe(1);
  });

  it('clear removes callbacks and getCallbackCount works', () => {
    hm.register('a:hook' as any, async (c) => c);
    hm.register('a:hook' as any, async (c) => c);
    expect(hm.getCallbackCount('a:hook' as any)).toBe(2);
    hm.clear('a:hook' as any);
    expect(hm.getCallbackCount('a:hook' as any)).toBe(0);

    hm.register('b:hook' as any, async (c) => c);
    expect(hm.getCallbackCount('b:hook' as any)).toBe(1);
    hm.clear();
    expect(hm.getCallbackCount('b:hook' as any)).toBe(0);
  });
});
