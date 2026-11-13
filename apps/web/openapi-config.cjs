/** RTK Query codegen: packages/contracts/openapi.json -> typed hooks. Run with `pnpm contracts:gen`. */
module.exports = {
  schemaFile: '../../packages/contracts/openapi.json',
  apiFile: './src/api/base.ts',
  apiImport: 'baseApi',
  outputFile: './src/api/generated.ts',
  exportName: 'api',
  hooks: true,
  tag: true,
};
