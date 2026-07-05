export function createL10nApi() {
  return {
    t(value: string, ...args: unknown[]): string {
      return args.reduce<string>((text, arg, index) => text.replace(`{${index}}`, String(arg)), value);
    }
  };
}
