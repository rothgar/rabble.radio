import { PrismaClient } from '@prisma/client';

type PrismaInstance = InstanceType<typeof PrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var __bluesky_spaces_prisma__: PrismaInstance | undefined;
}

export const prisma: PrismaInstance =
  globalThis.__bluesky_spaces_prisma__ ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__bluesky_spaces_prisma__ = prisma;
}

export default prisma;
