import { readInputs } from './read-inputs';

export async function uploadVersion(): Promise<void> {
  readInputs();
  throw new Error('modrinth/upload is not implemented yet');
}
