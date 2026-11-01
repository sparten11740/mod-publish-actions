export function parseChoice<Choice extends string>(inputName: string, value: string, choices: readonly Choice[]): Choice {
  const match = choices.find((choice) => choice === value);
  if (match === undefined) {
    throw new Error(`${inputName} must be one of ${choices.join(', ')}, got "${value}"`);
  }
  return match;
}
