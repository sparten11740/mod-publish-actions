import { build } from 'esbuild';

const ACTIONS = ['curseforge/upload', 'modrinth/upload'];

await Promise.all(
  ACTIONS.map((action) =>
    build({
      entryPoints: [`${action}/src/index.ts`],
      outfile: `${action}/dist/index.cjs`,
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
    }),
  ),
);
