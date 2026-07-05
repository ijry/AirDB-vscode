const vscode = require("vscode");

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fixture.hello", () => "hello")
  );
  return { activated: true };
};
