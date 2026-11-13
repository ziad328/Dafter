/* eslint-disable -- Vercel loads this CommonJS entry as is; the code it runs is linted in apps/api. */
// Vercel function: the compiled NestJS app (apps/api/src/vercel.ts), built by the buildCommand.
module.exports = require('../apps/api/dist/vercel.js').default;
