import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

type Bundles = Map<string, string>;

function readBundles(folder: string): Bundles {
  const bundlePaths = globSync('*/*/dist/*', { cwd: folder, exclude: (name) => name === 'node_modules' });
  return new Map(bundlePaths.map((bundlePath) => [bundlePath, readFileSync(join(folder, bundlePath), 'utf8')]));
}

export function findStaleBundles(staged: Bundles, built: Bundles): string[] {
  return [...new Set([...staged.keys(), ...built.keys()])].filter((bundlePath) => staged.get(bundlePath) !== built.get(bundlePath));
}

function checkStagedFiles(root: string): void {
  const copy = mkdtempSync(join(tmpdir(), 'check-staged-'));
  try {
    execFileSync('git', ['checkout-index', '--all', `--prefix=${copy}/`], { cwd: root, stdio: 'inherit' });
    const staged = readBundles(copy);
    execFileSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--reporter=silent'], { cwd: copy, stdio: 'inherit' });
    execFileSync('pnpm', ['check'], { cwd: copy, stdio: 'inherit' });
    execFileSync('pnpm', ['build'], { cwd: copy, stdio: 'inherit' });
    const stale = findStaleBundles(staged, readBundles(copy));
    if (stale.length > 0) {
      throw new Error(`These staged bundles do not match the staged source, so run pnpm build and stage them: ${stale.join(', ')}`);
    }
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    checkStagedFiles(dirname(import.meta.dirname));
    process.stdout.write('check:staged passed: the checks, build and bundles are all good for the staged files\n');
  } catch (error) {
    process.stderr.write(`check:staged failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
