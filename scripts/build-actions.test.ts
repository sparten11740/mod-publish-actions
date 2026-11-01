import { describe, expect, it } from 'vitest';

import { findBundledPackages, formatNotices } from './build-actions';

describe('findBundledPackages', () => {
  it('finds each package once, with its name, version and directory, sorted by name', () => {
    expect(
      findBundledPackages([
        'node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/index.js',
        'node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/api.js',
        'packages/core/node_modules/.pnpm/@actions+core@3.0.1/node_modules/@actions/core/lib/core.js',
      ]),
    ).toEqual([
      {
        name: '@actions/core',
        version: '3.0.1',
        directory: 'packages/core/node_modules/.pnpm/@actions+core@3.0.1/node_modules/@actions/core',
      },
      { name: 'zod', version: '4.6.7', directory: 'node_modules/.pnpm/zod@4.6.7/node_modules/zod' },
    ]);
  });

  it('reads the version of a package installed with a peer suffix', () => {
    expect(
      findBundledPackages(['node_modules/.pnpm/some-package@1.2.3_typescript@7.0.2/node_modules/some-package/index.js']),
    ).toMatchObject([{ name: 'some-package', version: '1.2.3' }]);
  });

  it('ignores the repository’s own source files', () => {
    expect(findBundledPackages(['packages/core/src/http.ts', 'modrinth/upload/src/index.ts'])).toEqual([]);
  });
});

describe('formatNotices', () => {
  it('gives every package its heading and full license text', () => {
    const notices = formatNotices([
      { heading: 'zod@4.6.7', license: 'MIT License\n\nCopyright Zod' },
      { heading: 'tunnel@0.0.6', license: 'The MIT License\n\nCopyright Tunnel' },
    ]);

    expect(notices).toContain('zod@4.6.7\n\nMIT License\n\nCopyright Zod');
    expect(notices).toContain('tunnel@0.0.6\n\nThe MIT License\n\nCopyright Tunnel');
    expect(notices.endsWith('\n')).toBe(true);
  });
});
