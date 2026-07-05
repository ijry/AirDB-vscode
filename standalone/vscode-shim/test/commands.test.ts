import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../src";

describe("CommandRegistry", () => {
  it("registers, executes, and disposes commands", async () => {
    const commands = new CommandRegistry();
    const disposable = commands.registerCommand("fixture.add", (a, b) => Number(a) + Number(b));

    await expect(commands.executeCommand("fixture.add", 2, 3)).resolves.toBe(5);

    disposable.dispose();
    await expect(commands.executeCommand("fixture.add", 2, 3)).rejects.toThrow("Command not found");
  });
});
