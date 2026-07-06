const vscode = require("vscode");

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fixture.hello", () => "hello"),
    vscode.commands.registerCommand("fixture.workspaceRoot", () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      return {
        rootPath: vscode.workspace.rootPath,
        name: vscode.workspace.name,
        folderIndex: folder?.index,
        folderName: folder?.name,
        folderPath: folder?.uri.fsPath,
        contextStoragePath: context.storagePath,
        contextGlobalStoragePath: context.globalStoragePath,
        contextLogPath: context.logUri.fsPath
      };
    })
  );
  return { activated: true };
};
