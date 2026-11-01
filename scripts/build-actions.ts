import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ACTIONS = ['curseforge/upload'];
const PNPM_PACKAGE_PATH = /^(.*node_modules\/\.pnpm\/([^/]+)\/node_modules\/(@[^/]+\/[^/]+|[^/]+))\//;
const LICENSE_FILE = /^licen[cs]e/i;
const NOTICE_INTRODUCTION = 'This bundle contains code from the following packages, each under its own license.';

type BundledPackage = {
  name: string;
  version: string;
  directory: string;
};

export function findBundledPackages(inputPaths: string[]): BundledPackage[] {
  const packages = new Map<string, BundledPackage>();
  for (const inputPath of inputPaths) {
    const [, directory, installName, name] = PNPM_PACKAGE_PATH.exec(inputPath) ?? [];
    if (directory !== undefined && installName !== undefined && name !== undefined) {
      const nameAndVersion = installName.split('_')[0] ?? installName;
      const version = nameAndVersion.slice(nameAndVersion.lastIndexOf('@') + 1);
      packages.set(directory, { name, version, directory });
    }
  }
  return [...packages.values()].toSorted((first, second) => first.name.localeCompare(second.name, 'en'));
}

function readLicense({ name, directory }: BundledPackage): string {
  const licenseFile = readdirSync(directory).find((file) => LICENSE_FILE.test(file));
  if (licenseFile === undefined) {
    throw new Error(`${name} has no license file to include in the bundle's notices`);
  }
  return readFileSync(join(directory, licenseFile), 'utf8').trim();
}

export function formatNotices(packages: { heading: string; license: string }[]): string {
  return `${[NOTICE_INTRODUCTION, ...packages.map(({ heading, license }) => `${heading}\n\n${license}`)].join('\n\n---\n\n')}\n`;
}

async function buildAction(action: string): Promise<void> {
  const outfile = `${action}/dist/index.cjs`;
  const { metafile } = await build({
    entryPoints: [`${action}/src/index.ts`],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    metafile: true,
  });
  const inputs = metafile.outputs[outfile]?.inputs ?? {};
  const usedInputs = Object.entries(inputs).flatMap(([inputPath, { bytesInOutput }]) => (bytesInOutput > 0 ? [inputPath] : []));
  const notices = findBundledPackages(usedInputs).map((bundledPackage) => ({
    heading: `${bundledPackage.name}@${bundledPackage.version}`,
    license: readLicense(bundledPackage),
  }));
  writeFileSync(`${action}/dist/THIRD_PARTY_LICENSES.txt`, formatNotices(notices));
}

if (import.meta.main) {
  await Promise.all(ACTIONS.map(buildAction));
}
