import { describe, expect, it } from 'vitest';

import { parseChoice } from './parse-choice';

describe('parseChoice', () => {
  it('returns a value that is one of the choices', () => {
    expect(parseChoice('release-type', 'beta', ['alpha', 'beta'])).toBe('beta');
  });

  it('names the input and the choices when the value is not one of them', () => {
    expect(() => parseChoice('release-type', 'stable', ['alpha', 'beta'])).toThrow('release-type must be one of alpha, beta, got "stable"');
  });
});
