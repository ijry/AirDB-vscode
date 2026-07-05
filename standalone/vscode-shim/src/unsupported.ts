export function unsupported(api: string): never {
  throw new Error(`Not implemented in standalone host: ${api}`);
}
