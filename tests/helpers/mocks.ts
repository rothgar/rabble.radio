// tests/helpers/mocks.ts
//
// Shared pieces for the per-file `vi.mock('@/lib/session', ...)` and
// `vi.mock('@/lib/db', ...)` stubs most API/lib tests hand-write.

import { vi } from 'vitest';

export type SessionUser =
  | { did: string; handle: string; displayName?: string | null }
  | null;

/** A `getCurrentUser` stub resolved to `user`. Wire it into
 * `vi.mock('@/lib/session', () => ({ getCurrentUser: mockSession(user) }))`;
 * the returned `vi.fn()` can still be reconfigured per test. */
export function mockSession(user: SessionUser = null) {
  return vi.fn().mockResolvedValue(user);
}

type ModelStub<Methods extends readonly string[]> = {
  [K in Methods[number]]: ReturnType<typeof vi.fn>;
};
type PrismaStub<Models extends Record<string, readonly string[]>> = {
  [K in keyof Models]: ModelStub<Models[K]>;
};

/** Builds a `{ model: { method: vi.fn(), ... } }` stub for
 * `vi.mock('@/lib/db', () => ({ prisma: prismaStub({ space: ['findUnique', 'update'] }) }))`,
 * so a test names only the methods it uses instead of hand-writing the object. */
export function prismaStub<Models extends Record<string, readonly string[]>>(
  models: Models
): PrismaStub<Models> {
  const stub = {} as PrismaStub<Models>;
  for (const model of Object.keys(models) as (keyof Models)[]) {
    const methods = {} as Record<string, ReturnType<typeof vi.fn>>;
    for (const method of models[model]) {
      methods[method] = vi.fn();
    }
    stub[model] = methods as ModelStub<Models[typeof model]>;
  }
  return stub;
}
