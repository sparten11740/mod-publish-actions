import { describe, expect, it } from 'vitest';

import { findStaleBundles } from './check-staged';

describe('findStaleBundles', () => {
  it('finds nothing when the built bundles match the staged ones', () => {
    const bundles = new Map([['modrinth/upload/dist/index.cjs', 'code']]);

    expect(findStaleBundles(bundles, new Map(bundles))).toEqual([]);
  });

  it('names a bundle whose contents changed', () => {
    const staged = new Map([
      ['curseforge/upload/dist/index.cjs', 'same'],
      ['modrinth/upload/dist/index.cjs', 'old'],
    ]);
    const built = new Map([
      ['curseforge/upload/dist/index.cjs', 'same'],
      ['modrinth/upload/dist/index.cjs', 'new'],
    ]);

    expect(findStaleBundles(staged, built)).toEqual(['modrinth/upload/dist/index.cjs']);
  });

  it('names a bundle that was never staged', () => {
    expect(findStaleBundles(new Map(), new Map([['modrinth/gallery/dist/index.cjs', 'code']]))).toEqual([
      'modrinth/gallery/dist/index.cjs',
    ]);
  });

  it('names a staged bundle the build no longer produces', () => {
    expect(findStaleBundles(new Map([['old/action/dist/index.cjs', 'junk']]), new Map())).toEqual(['old/action/dist/index.cjs']);
  });
});
