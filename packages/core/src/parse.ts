const LIST_SEPARATOR = /[\n,]/;
const DEPENDENCY_TYPES = ['required', 'optional', 'embedded', 'incompatible'] as const;

type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export type Dependency = {
  project: string;
  type: DependencyType;
};

export function parseList(value: string): string[] {
  return value
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseChoice<Choice extends string>(inputName: string, value: string, choices: readonly Choice[]): Choice {
  const match = choices.find((choice) => choice === value);
  if (match === undefined) {
    throw new Error(`${inputName} must be one of ${choices.join(', ')}, got "${value}"`);
  }
  return match;
}

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
