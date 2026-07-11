# Webpack 5 Vue 3 Element Plus Upgrade Design

## Goal

Upgrade the AirDB VS Code extension build and webview stack so build, package, and publish all run on Node 20, while migrating the webview runtime from Vue 2 + element-ui + umy-table to Vue 3 + Element Plus + vxe-table.

## Scope

In scope:
- Upgrade the Webpack toolchain to Webpack 5 and compatible loaders/plugins.
- Keep the existing multi-entry build shape and output paths.
- Migrate the three webview entry points to Vue 3.
- Replace element-ui with Element Plus.
- Replace umy-table `ux-grid`/`ux-table-column` usage with vxe-table.
- Update `publish.sh` so build, package, and publish use Node 20.
- Make source changes required by Vue 3, Element Plus, vxe-table, and Webpack 5 compatibility.
- Update development documentation for the Node 20 toolchain.

Out of scope:
- Redesigning the product UI.
- Replacing the VS Code extension host architecture.
- Replacing database driver logic.
- Switching the webview build from Webpack to Vite.
- Replacing the existing `g2` status charts unless Vue 3 migration exposes a direct compatibility failure.

## Current State

The project currently uses:
- `webpack@^4.43.0` and `webpack-cli@^3.3.11`.
- Vue 2 webviews through `vue@^2.6.11`, `vue-router@^3.4.1`, `vue-i18n@8.2.1`.
- element-ui through `element-ui@^2.13.2`.
- umy-table through `umy-table@1.0.8`, exposed in templates as `ux-grid` and `ux-table-column`.
- `publish.sh` builds with Node 16 and packages/publishes with Node 20.

The active Webpack output contract is:
- `out/extension.js` for the extension host bundle.
- `out/webview/app.html` and `out/webview/js/app.js`.
- `out/webview/result.html` and `out/webview/js/query.js`.
- `out/webview/queryWorkspace.html` and `out/webview/js/queryWorkspace.js`.

## Architecture

Keep the current two-bundle architecture in `webpack.config.js`:

```text
webpack.config.js
├─ extension bundle  (target: node)
│  entry: src/extension.ts
│  output: out/extension.js
│
└─ webview bundles   (target: web)
   entries:
   - app            -> out/webview/js/app.js + app.html
   - query          -> out/webview/js/query.js + result.html
   - queryWorkspace -> out/webview/js/queryWorkspace.js + queryWorkspace.html
```

The runtime relationship stays the same:

```text
VS Code Extension Host
  -> webview HTML
    -> Vue 3 app
      -> Element Plus UI
      -> vxe-table grids
      -> existing vscode postMessage bridge
```

The publish flow becomes:

```text
Node 20
  npm run build
  npx @vscode/vsce package
  npx @vscode/vsce publish --azure-credential
```

## Dependency Changes

Build dependencies:
- Upgrade `webpack` to 5.x.
- Upgrade `webpack-cli` to 5.x.
- Upgrade `html-webpack-plugin` to 5.x.
- Upgrade `copy-webpack-plugin` to a Webpack 5 compatible version.
- Upgrade `css-loader`, `style-loader`, `postcss-loader`, and `ts-loader` to Webpack 5 compatible versions.
- Upgrade `vue-loader` to the Vue 3 compatible line.
- Remove `vue-template-compiler`.
- Add `@vue/compiler-sfc`.
- Prefer Webpack 5 asset modules over `url-loader` and `file-loader`.

Runtime dependencies:
- Upgrade `vue` to 3.x.
- Upgrade `vue-router` to 4.x.
- Upgrade `vue-i18n` to 9.x.
- Replace `element-ui` with `element-plus`.
- Add `@element-plus/icons-vue`.
- Remove `umy-table`.
- Add `vxe-table` and its compatible `xe-utils` dependency.

## Webpack Changes

Extension bundle:
- Keep `target: "node"`.
- Remove Webpack 4 `node: { fs: "empty", net: "empty", ... }` usage.
- Convert `IgnorePlugin` calls to the Webpack 5 object form.
- Keep existing externals for `vscode`, native modules, and heavy runtime drivers.
- Add externals only when build errors show that bundling a runtime module is unsafe.

Webview bundle:
- Set `target: "web"`.
- Keep the existing entry names and HTML output names.
- Use Vue 3 compatible `VueLoaderPlugin`.
- Update Vue alias to a Vue 3 browser ESM build.
- Replace URL/file loader rules with Webpack 5 `asset` rules where practical.
- Preserve split chunk names where possible to avoid output churn.

Library bundle:
- Update `webpack.config.lib.js` to Webpack 5 compatible plugin and node config.
- Remove Webpack 4 `-p` usage from the `lib` script.

## Vue 3 Migration

Entry points:
- `src/vue/main.js`
- `src/vue/result/main.js`
- `src/vue/queryWorkspace/main.js`

Each entry point moves from `new Vue({ el, ... })` to `createApp(App)`.

Global setup:
- Register Element Plus with the current language selection.
- Register vxe-table once per entry.
- Register router and i18n using Vue 3 APIs.
- Keep current theme CSS imports.

Router:
- Move from `new VueRouter(...)` to `createRouter(...)`.
- Use `createWebHashHistory()` so webview routing remains compatible with VS Code webview URLs.

i18n:
- Move from Vue I18n 8 to Vue I18n 9.
- Keep existing message files and translation keys.
- Preserve `$t(...)` template usage through legacy-compatible configuration if practical.

Template and lifecycle changes:
- Replace `.sync` with `v-model` or `v-model:prop`.
- Replace `slot`/`slot-scope` with `v-slot`, `#default`, and `#header`.
- Replace `beforeDestroy` with `beforeUnmount`.
- Remove `.native` event modifiers.
- Replace `el-icon-*` string icon props with Element Plus icon components.
- Replace removed Vue 2 instance APIs such as `$set` and `$delete` with direct reactive assignments.

Element Plus changes:
- Replace element-ui imports and CSS with Element Plus imports and CSS.
- Replace global APIs such as `$message`, `$confirm`, and `$loading` with Element Plus compatible usage.
- Update dialog `:visible.sync` to `v-model`.
- Keep existing component props and emitted event names when those events are part of the extension/webview contract.

## vxe-table Migration

Replace `umy-table` usage in:
- `src/vue/result/App.vue`
- `src/vue/queryWorkspace/App.vue`
- `src/vue/design/ColumnPanel.vue`
- `src/vue/design/IndexPanel.vue`
- `src/vue/status/index.vue`
- `src/vue/structDiff/index.vue`

Mapping:
- `ux-grid` becomes `vxe-table` or `vxe-grid`.
- `ux-table-column` becomes `vxe-column`.
- Checkbox columns use vxe-table checkbox column support.
- Index columns use vxe-table sequence/index support.
- Header and cell slots use Vue 3 slot syntax.
- Existing result table events remain available to child components: execute, sendToVscode, openEditor, edit list updates, sort changes, and selection changes.
- Existing table sizing behavior remains based on the current `remainHeight` computations.

The result table is the highest-risk part of the migration because it combines sorting, selection, pagination, filtering, editable cells, and export. It should be migrated and tested before the smaller grids.

## Publish Script

Update `publish.sh`:
- Use Node 20 for dependency installation, build, package, and publish.
- Keep the ability to override the Node version through environment variables.
- Keep Microsoft Entra ID publishing through `vsce publish --azure-credential`.
- Keep `PUBLISH_DRY_RUN=1`.
- Remove assumptions that Node 16 is needed for build.

## Documentation

Update `DEVELOP.md`:
- State that Node 20 is the supported build and publish runtime.
- Remove the old `NODE_OPTIONS=--openssl-legacy-provider` guidance after Webpack 5 verifies cleanly.
- Keep current VS Code extension packaging instructions, adjusted to the modern `@vscode/vsce` flow.

## Validation

Required commands:
- `npm install` or `npm ci`, depending on lockfile state after dependency changes.
- `npm run build` on Node 20.
- `npx @vscode/vsce package --allow-star-activation`.
- `PUBLISH_DRY_RUN=1 bash ./publish.sh`.

Manual smoke checks:
- Extension activates.
- Connection page renders.
- Result table page renders.
- Query workspace page renders.
- A simple SQL query can execute and display rows.
- Result table sorting, pagination, export, and basic edit flow work.
- Table design column and index grids render.
- Status page grids and charts render.

## Risks

- `umy-table` to vxe-table is not a one-line replacement. Result grid behavior must be checked carefully.
- Element Plus component props differ from element-ui, especially dialogs, icons, loading, and message APIs.
- Vue I18n 9 has composition and legacy modes. The migration should preserve existing `$t` template calls before considering composition API rewrites.
- Webpack 5 no longer polyfills Node core modules for web targets. Any webview dependency that expects Node APIs must be externalized, replaced, or given an explicit fallback.
- VS Code webview CSP and asset paths can expose issues only after packaging, so package validation is required in addition to local build.

## Implementation Order

1. Upgrade Webpack 5 and make Node 20 build pass for the extension bundle.
2. Upgrade Vue 3 core dependencies and convert the three entry points.
3. Migrate router and i18n setup.
4. Replace element-ui with Element Plus and fix global UI APIs.
5. Replace umy-table with vxe-table, starting with `result/App.vue`.
6. Migrate remaining Vue 2 template syntax and lifecycle hooks.
7. Update `publish.sh` and `DEVELOP.md`.
8. Run build, package, dry-run publish, and manual smoke checks.

## Self Review

- No incomplete markers remain in this spec.
- Scope is focused on build and webview runtime migration; database drivers and product redesign are explicitly out of scope.
- The output contract keeps existing `out` paths, so extension host code should not need webview URI changes.
- The plan acknowledges the highest-risk area: replacing `umy-table` in the result grid.
- Validation includes both build/package commands and manual webview smoke checks.
