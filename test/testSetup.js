const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

const vscodeStub = {
  l10n: {
    t(message, ...args) {
      return String(message).replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ""));
    },
  },
  workspace: {
    getConfiguration() {
      return {
        get(_key, defaultValue) {
          return defaultValue === undefined ? 100 : defaultValue;
        },
        update() {
          return Promise.resolve();
        },
      };
    },
  },
  extensions: {
    getExtension() {
      return { extensionPath: root };
    },
  },
  window: {
    createStatusBarItem() {
      return { show() {}, hide() {}, dispose() {} };
    },
    showErrorMessage() {},
    showInformationMessage() {},
  },
  StatusBarAlignment: { Left: 1 },
  TreeItem: class TreeItem {
    constructor(label) {
      this.label = label;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class ThemeIcon {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  },
  ThemeColor: class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  },
  Position: class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "vscode") {
    return request;
  }
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(root, "src", request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.cache.vscode = {
  id: "vscode",
  filename: "vscode",
  loaded: true,
  exports: vscodeStub,
};

require("ts-node/register/transpile-only");

function requireTs(relativePath) {
  return require(path.resolve(root, relativePath));
}

module.exports = { requireTs, vscodeStub, root };
