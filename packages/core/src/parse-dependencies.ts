import { parseChoice } from './parse-choice';
import { parseList } from './parse-list';

const DEPENDENCY_TYPES = ['required', 'optional', 'embedded', 'incompatible'] as const;

type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export type Dependency = {
  project: string;
  type: DependencyType;
};

function parseDependency(entry: string): Dependency {
  const separator = entry.lastIndexOf(':');
  if (separator <= 0) {
    throw new Error(`dependencies entries must look like project:type, got "${entry}"`);
  }
  return {
    project: entry.slice(0, separator),
    type: parseChoice('dependency type', entry.slice(separator + 1), DEPENDENCY_TYPES),
  };
}

export function parseDependencies(value: string): Dependency[] {
  return parseList(value).map(parseDependency);
}
