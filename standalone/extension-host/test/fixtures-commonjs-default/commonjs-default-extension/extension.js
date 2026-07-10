const vscode = require("vscode");

module.exports = bootstrap();

function bootstrap() {
  return {
    activate(context) {
      context.subscriptions.push(
        vscode.commands.registerCommand("fixture.commonjsDefault", () => "commonjs-default")
      );
      return { activated: true };
    }
  };
}
