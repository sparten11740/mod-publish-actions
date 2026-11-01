import { setFailed } from '@actions/core';

export async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    setFailed(error instanceof Error ? error.message : String(error));
  }
}
