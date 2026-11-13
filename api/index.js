/* eslint-disable -- Vercel loads this CommonJS entry as is; the code it runs is linted in apps/api. */
// Vercel function: the NestJS app (apps/api/src/vercel.ts) bundled into one CommonJS file by
// `pnpm --filter @dafter/api bundle`, because Vercel's loader can't require() ESM packages (NestJS 12).
module.exports = require('../apps/api/dist/vercel.bundle.cjs').default;
