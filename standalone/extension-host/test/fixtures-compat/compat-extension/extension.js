const fs = require("node:fs/promises");
const path = require("node:path");
const vscode = require("vscode");

exports.activate = function activate(context) {
  const activatedExports = { activated: true, fixture: "compat-extension" };

  context.subscriptions.push(
    vscode.commands.registerCommand("compat.fixture.extra", () => "extra-ok"),
    vscode.commands.registerCommand("compat.fixture.run", () => runCompatibilityFixture(context))
  );

  return activatedExports;
};

async function runCompatibilityFixture(context) {
  const configurationChanges = [];
  const configurationDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    configurationChanges.push({
      compat: event.affectsConfiguration("compat"),
      smoke: event.affectsConfiguration("compat.smoke")
    });
  });

  const configuration = vscode.workspace.getConfiguration("compat");
  await configuration.update("smoke", "enabled");

  await vscode.commands.executeCommand("setContext", "compat.fixture.ready", true);
  await vscode.commands.executeCommand("setContext", "compat.fixture.mode", "smoke");

  const secretChanges = [];
  const secretDisposable = context.secrets.onDidChange((event) => secretChanges.push(event.key));
  await context.secrets.store("compat.token", "secret-value");
  const storedSecret = await context.secrets.get("compat.token");
  await context.secrets.delete("compat.token");
  const deletedSecret = await context.secrets.get("compat.token");
  secretDisposable.dispose();

  const watcherEvents = await exerciseWatcher();
  const commands = await vscode.commands.getCommands(true);
  const extension = vscode.extensions.getExtension("fixture.compat-extension");
  const activated = await extension?.activate();
  const extraCommandResult = await vscode.commands.executeCommand("compat.fixture.extra");

  configurationDisposable.dispose();

  return {
    configuration: {
      value: configuration.get("smoke"),
      changed: configurationChanges.some((change) => change.compat && change.smoke)
    },
    watcherEvents,
    secrets: {
      stored: storedSecret,
      deleted: deletedSecret === undefined,
      changedKeys: secretChanges
    },
    commands: {
      includesRun: commands.includes("compat.fixture.run"),
      includesExtra: commands.includes("compat.fixture.extra"),
      extraCommandResult
    },
    extension: {
      id: extension?.id,
      isActive: extension?.isActive,
      exports: activated
    }
  };
}

async function exerciseWatcher() {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? vscode.workspace.rootPath;
  const filePath = path.join(root, "compat-fixture.compat");
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.compat");
  const events = [];

  watcher.onDidCreate((uri) => events.push({ type: "create", path: uri.fsPath }));
  watcher.onDidChange((uri) => events.push({ type: "change", path: uri.fsPath }));
  watcher.onDidDelete((uri) => events.push({ type: "delete", path: uri.fsPath }));

  try {
    await fs.mkdir(root, { recursive: true });
    await delay(100);

    const created = waitForEvent(events, "create");
    await fs.writeFile(filePath, "one", "utf8");
    await created;

    const changed = waitForEvent(events, "change");
    await fs.writeFile(filePath, "two", "utf8");
    await changed;

    const deleted = waitForEvent(events, "delete");
    await fs.rm(filePath, { force: true });
    await deleted;

    return events;
  } finally {
    watcher.dispose();
    await fs.rm(filePath, { force: true });
  }
}

function waitForEvent(events, type) {
  if (events.some((event) => event.type === type)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for watcher ${type} event`));
    }, 5000);
    const interval = setInterval(() => {
      if (events.some((event) => event.type === type)) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 25);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
