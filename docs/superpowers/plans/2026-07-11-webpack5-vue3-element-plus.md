# Webpack 5 Vue 3 Element Plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the AirDB VS Code extension so build, package, and publish run on Node 20, and migrate webviews from Vue 2 + element-ui + umy-table to Vue 3 + Element Plus + vxe-table.

**Architecture:** Keep the existing extension bundle plus multi-entry webview bundle in Webpack. The extension host remains `target: "node"` and emits `out/extension.js`; webviews remain `target: "web"` and emit the same HTML/JS paths under `out/webview`. Vue 3 apps continue to communicate through the existing VS Code postMessage bridge.

**Tech Stack:** Node 20.20.2, Webpack 5.108.4, webpack-cli 7.2.1, Vue 3.5.39, Vue Router 4.6.3, Vue I18n 11.4.6, Element Plus 2.14.3, vxe-table 4.19.25, xe-utils 4.0.11, TypeScript 5.6.2.

## Global Constraints

- Build, package, and publish must run on Node 20.
- Keep these output paths unchanged: `out/extension.js`, `out/webview/app.html`, `out/webview/js/app.js`, `out/webview/result.html`, `out/webview/js/query.js`, `out/webview/queryWorkspace.html`, `out/webview/js/queryWorkspace.js`.
- Keep Webpack as the build system; do not switch webviews to Vite.
- Do not redesign the UI.
- Do not change database driver behavior.
- Do not replace the existing `g2` status charts unless Vue 3 exposes a direct compatibility failure.
- Do not stage or commit the untracked `logs/` directory.

---

## File Structure

- `package.json`: update dependency versions, remove Vue 2/element-ui/umy-table packages, update scripts for Webpack 5.
- `package-lock.json`: refresh lockfile after dependency changes.
- `webpack.config.js`: migrate extension and webview configs to Webpack 5.
- `webpack.config.lib.js`: migrate legacy library bundle config to Webpack 5.
- `publish.sh`: use Node 20 for dependency install, build, package, and publish.
- `DEVELOP.md`: document Node 20 and modern `@vscode/vsce` packaging.
- `src/vue/bootstrap/installUi.js`: new shared installer for Element Plus and vxe-table.
- `src/vue/i18n/index.js`: migrate main app i18n to Vue I18n 9.
- `src/vue/result/i18n/index.js`: migrate result app i18n to Vue I18n 9.
- `src/vue/main.js`: migrate the main webview entry to `createApp`, Vue Router 4, shared UI installer, and Vue I18n 9.
- `src/vue/result/main.js`: migrate the result webview entry to `createApp`, shared UI installer, Contextmenu plugin, and Vue I18n 9.
- `src/vue/queryWorkspace/main.js`: migrate the query workspace entry to `createApp` and shared UI installer.
- `src/vue/result/component/Contextmenu/index.js`: replace Vue 2 `Vue.extend` plugin installation with a Vue 3 app-based runtime.
- `src/vue/result/component/Contextmenu/components/Contextmenu.vue`: remove Vue 2 instance construction and lifecycle names.
- `src/vue/result/component/Contextmenu/components/Submenu.vue`: remove Vue 2 instance construction and lifecycle names.
- `src/vue/result/App.vue`: migrate result grid from `ux-grid` to `vxe-table`, dialog `v-model`, and Vue 3 slots.
- `src/vue/queryWorkspace/App.vue`: migrate query result grid from `ux-grid` to `vxe-table`, dialog `v-model`, and Vue 3 slots.
- `src/vue/design/ColumnPanel.vue`: migrate editable design grid to vxe-table and Element Plus APIs.
- `src/vue/design/IndexPanel.vue`: migrate index grid to vxe-table and dialog `v-model`.
- `src/vue/status/index.vue`: migrate three status grids to vxe-table.
- `src/vue/structDiff/index.vue`: migrate structure diff grid to vxe-table.
- `src/vue/result/component/ExportDialog.vue`: convert `visible` prop to Vue 3 `v-model:visible`.
- `src/vue/result/component/EditDialog/index.vue`: convert dialog `v-model`, footer slot, deep selectors, and message API.
- `src/vue/result/component/Toolbar/index.vue`: replace Element UI icon classes with Element Plus icon components.
- Remaining files under `src/vue`: perform mechanical Vue 3 syntax changes for `.sync`, `slot-scope`, `.native`, `beforeDestroy`, deep selectors, and icon props.

---

### Task 1: Upgrade Dependencies and Lockfile

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: current npm lockfile and dependency graph.
- Produces: dependency graph with Webpack 5, Vue 3, Element Plus, and vxe-table available to later tasks.

- [ ] **Step 1: Confirm the starting worktree only has expected untracked files**

Run:

```powershell
git status --short
```

Expected: only `?? logs/` or other user-owned files that are unrelated to this migration. Do not stage `logs/`.

- [ ] **Step 2: Switch to Node 20**

Run:

```powershell
nvm use 20.20.2
node -v
npm -v
```

Expected: `node -v` prints `v20.20.2`.

- [ ] **Step 3: Remove replaced packages**

Run:

```powershell
npm uninstall element-ui umy-table vue-template-compiler url-loader file-loader
```

Expected: npm removes the Vue 2 UI/table/compiler packages and updates `package.json` plus `package-lock.json`.

- [ ] **Step 4: Install runtime packages at pinned targets**

Run:

```powershell
npm install vue@3.5.39 vue-router@4.6.3 vue-i18n@11.4.6 element-plus@2.14.3 @element-plus/icons-vue@2.3.2 vxe-table@4.19.25 xe-utils@4.0.11
```

Expected: `package.json` dependencies include these versions.

- [ ] **Step 5: Install Webpack 5 build packages at pinned targets**

Run:

```powershell
npm install --save-dev webpack@5.108.4 webpack-cli@7.2.1 html-webpack-plugin@5.6.7 copy-webpack-plugin@14.0.0 css-loader@7.1.4 style-loader@4.0.0 postcss-loader@8.2.1 ts-loader@9.6.2 vue-loader@17.4.2 @vue/compiler-sfc@3.5.39
```

Expected: `package.json` devDependencies include these versions.

- [ ] **Step 6: Verify package dependency shape**

Run:

```powershell
node -e "const p=require('./package.json'); const keys=['vue','vue-router','vue-i18n','element-plus','@element-plus/icons-vue','vxe-table','xe-utils','element-ui','umy-table','vue-template-compiler','webpack','webpack-cli','vue-loader']; for (const k of keys) console.log(k, p.dependencies?.[k] || p.devDependencies?.[k] || '<missing>')"
```

Expected:

```text
vue ^3.5.39
vue-router ^4.6.3
vue-i18n ^11.4.6
element-plus ^2.14.3
@element-plus/icons-vue ^2.3.2
vxe-table ^4.19.25
xe-utils ^4.0.11
element-ui <missing>
umy-table <missing>
vue-template-compiler <missing>
webpack ^5.108.4
webpack-cli ^7.2.1
vue-loader ^17.4.2
```

- [ ] **Step 7: Commit dependency update**

Run:

```powershell
git add package.json package-lock.json
git commit -m "build: upgrade webview dependencies"
```

Expected: one commit containing only dependency and lockfile changes.

---

### Task 2: Migrate Webpack Configs to Webpack 5

**Files:**
- Modify: `webpack.config.js`
- Modify: `webpack.config.lib.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Webpack 5 dependency graph from Task 1.
- Produces: named `extension` and `webview` Webpack configs that preserve output paths and can be run independently.

- [ ] **Step 1: Update `package.json` scripts**

Change scripts to this exact shape:

```json
{
  "dev": "webpack --progress",
  "clean": "rimraf out",
  "build": "npm run clean && webpack --progress --mode=production",
  "lib": "webpack --config webpack.config.lib.js --progress --mode=production",
  "package": "npx vsce package",
  "publish": "npx vsce publish"
}
```

Expected: the `lib` script no longer uses Webpack 4 `-p`.

- [ ] **Step 2: Replace `webpack.config.js` with Webpack 5 compatible configuration**

Use this exact structure, preserving the existing externals list:

```js
const path = require('path');
const webpack = require('webpack');
const { VueLoaderPlugin } = require('vue-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isProd = process.argv.includes('--mode=production') || process.env.NODE_ENV === 'production';
const mode = isProd ? 'production' : 'development';

const extensionExternals = {
  vscode: 'commonjs vscode',
  mockjs: 'mockjs vscode',
  'mongodb-client-encryption': 'commonjs mongodb-client-encryption',
  oracledb: 'commonjs oracledb',
  '@clickhouse/client': 'commonjs @clickhouse/client',
  '@tdengine/websocket': 'commonjs @tdengine/websocket',
  duckdb: 'commonjs duckdb',
  amqplib: 'commonjs amqplib',
  '@aws-sdk/client-s3': 'commonjs @aws-sdk/client-s3',
  '@aws-sdk/s3-request-presigner': 'commonjs @aws-sdk/s3-request-presigner',
  'neo4j-driver': 'commonjs neo4j-driver',
  'snowflake-sdk': 'commonjs snowflake-sdk'
};

module.exports = [
  {
    name: 'extension',
    target: 'node',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'out'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '[absoluteResourcePath]'
    },
    externals: extensionExternals,
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    plugins: [
      new webpack.IgnorePlugin({
        resourceRegExp: /^(pg-native|cardinal|encoding|aws4)$/
      })
    ],
    module: {
      rules: [
        { test: /\.ts$/, exclude: /(node_modules|bin)/, use: ['ts-loader'] }
      ]
    },
    optimization: { minimize: isProd },
    watch: !isProd,
    mode,
    devtool: isProd ? false : 'source-map'
  },
  {
    name: 'webview',
    target: 'web',
    entry: {
      app: './src/vue/main.js',
      query: './src/vue/result/main.js',
      queryWorkspace: './src/vue/queryWorkspace/main.js'
    },
    output: {
      path: path.resolve(__dirname, 'out'),
      filename: 'webview/js/[name].js',
      clean: false
    },
    resolve: {
      extensions: ['.vue', '.js'],
      alias: {
        vue$: 'vue/dist/vue.esm-bundler.js',
        '@': path.resolve(__dirname, 'src')
      },
      fallback: {
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        dns: false
      }
    },
    plugins: [
      new VueLoaderPlugin(),
      new HtmlWebpackPlugin({ inject: true, template: './public/index.html', chunks: ['app'], filename: 'webview/app.html' }),
      new HtmlWebpackPlugin({
        inject: true,
        templateContent: '<head><script src="js/oldCompatible.js"></script></head><body><div id="app"></div></body>',
        chunks: ['query'],
        filename: 'webview/result.html'
      }),
      new HtmlWebpackPlugin({
        inject: true,
        templateContent: '<head><script src="js/oldCompatible.js"></script></head><body><div id="app"></div></body>',
        chunks: ['queryWorkspace'],
        filename: 'webview/queryWorkspace.html'
      }),
      new CopyWebpackPlugin({
        patterns: [{ from: 'public', to: './webview' }]
      })
    ],
    module: {
      unknownContextCritical: false,
      rules: [
        { test: /\.vue$/, loader: 'vue-loader' },
        { test: /(\.css|\.cssx)$/, use: ['vue-style-loader', 'css-loader', 'postcss-loader'] },
        { test: /\.(png|jpe?g|gif|svg)(\?.*)?$/, type: 'asset', parser: { dataUrlCondition: { maxSize: 8192 } } },
        { test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/, type: 'asset', parser: { dataUrlCondition: { maxSize: 80000 } } }
      ]
    },
    optimization: {
      minimize: isProd,
      splitChunks: {
        cacheGroups: {
          antv: { name: 'antv', test: /[\\/]@antv[\\/]/, chunks: 'all', priority: 10 },
          vendor: { name: 'vendor', test: /[\\/]node_modules[\\/]/, chunks: 'all', priority: -1 }
        }
      }
    },
    watch: !isProd,
    mode,
    devtool: isProd ? false : 'source-map'
  }
];
```

- [ ] **Step 3: Replace `webpack.config.lib.js` with Webpack 5 compatible configuration**

Use this exact structure:

```js
const path = require('path');
const webpack = require('webpack');

module.exports = [
  {
    name: 'legacy-lib',
    target: 'node',
    entry: {
      'node-xlsx': './node_modules/node-xlsx/lib/index.js',
      tedious: './node_modules/tedious/lib/tedious.js'
    },
    output: {
      path: path.resolve(__dirname, 'src/bin'),
      filename: '[name].js',
      libraryTarget: 'commonjs2'
    },
    externals: {
      vscode: 'commonjs vscode'
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '~': path.resolve(__dirname, './src')
      }
    },
    plugins: [
      new webpack.IgnorePlugin({
        resourceRegExp: /^(pg-native|supports-color|mongodb-client-encryption)$/
      })
    ],
    module: {
      rules: [
        { test: /\.ts$/, exclude: /node_modules/, use: ['ts-loader'] }
      ]
    },
    optimization: { minimize: true },
    watch: false,
    mode: 'production',
    devtool: false
  }
];
```

- [ ] **Step 4: Verify extension bundle only**

Run:

```powershell
npx webpack --config webpack.config.js --mode=production --config-name extension
```

Expected: `out/extension.js` is emitted. If Webpack reports a runtime dependency that cannot be bundled safely, add that dependency to `extensionExternals` with the `commonjs <package>` form and rerun this command.

- [ ] **Step 5: Capture current webview failure for the next task**

Run:

```powershell
npx webpack --config webpack.config.js --mode=development --config-name webview
```

Expected: this may fail because Vue entry points still use Vue 2 APIs and element-ui imports. Save the first failing import/API in the task notes.

- [ ] **Step 6: Commit Webpack config changes**

Run:

```powershell
git add webpack.config.js webpack.config.lib.js package.json
git commit -m "build: migrate webpack config to version 5"
```

Expected: one commit containing Webpack config and script changes.

---

### Task 3: Add Shared Vue 3 UI Bootstrap

**Files:**
- Create: `src/vue/bootstrap/installUi.js`
- Modify: `src/vue/i18n/index.js`
- Modify: `src/vue/result/i18n/index.js`

**Interfaces:**
- Produces: `installUi(app, options?: { locale?: string })` for all Vue 3 webview entry points.
- Produces: `i18n` Vue I18n 9 instances that preserve `$t(...)` template calls.

- [ ] **Step 1: Create `src/vue/bootstrap/installUi.js`**

Create this file:

```js
import ElementPlus, { ElLoading, ElMessage, ElMessageBox } from 'element-plus';
import en from 'element-plus/es/locale/lang/en';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import VXETable from 'vxe-table';

import 'element-plus/dist/index.css';
import 'vxe-table/lib/style.css';

function resolveElementLocale(locale) {
  return locale === 'zh' || locale === 'zh-CN' ? zhCn : en;
}

export function installUi(app, options = {}) {
  const locale = resolveElementLocale(options.locale);
  app.use(ElementPlus, { locale });
  app.use(VXETable);

  Object.entries(ElementPlusIconsVue).forEach(([name, component]) => {
    app.component(name, component);
  });

  app.config.globalProperties.$message = ElMessage;
  app.config.globalProperties.$msgbox = ElMessageBox;
  app.config.globalProperties.$alert = ElMessageBox.alert;
  app.config.globalProperties.$confirm = ElMessageBox.confirm;
  app.config.globalProperties.$prompt = ElMessageBox.prompt;
  app.config.globalProperties.$loading = ElLoading.service;
}
```

- [ ] **Step 2: Replace `src/vue/i18n/index.js`**

Use this file body:

```js
import { createI18n } from 'vue-i18n';

const locale = 'en';

export const i18n = createI18n({
  legacy: true,
  globalInjection: true,
  locale,
  messages: {
    zh: require('./lang/zh').default,
    en: require('./lang/en').default,
    ar: require('./lang/ar').default,
    fr: require('./lang/fr').default,
    ja: require('./lang/ja').default,
    ko: require('./lang/ko').default,
    ru: require('./lang/ru').default
  }
});

export default i18n;
```

- [ ] **Step 3: Replace `src/vue/result/i18n/index.js`**

Use the same body as `src/vue/i18n/index.js`, preserving the relative `./lang/*` imports:

```js
import { createI18n } from 'vue-i18n';

const locale = 'en';

export const i18n = createI18n({
  legacy: true,
  globalInjection: true,
  locale,
  messages: {
    zh: require('./lang/zh').default,
    en: require('./lang/en').default,
    ar: require('./lang/ar').default,
    fr: require('./lang/fr').default,
    ja: require('./lang/ja').default,
    ko: require('./lang/ko').default,
    ru: require('./lang/ru').default
  }
});

export default i18n;
```

- [ ] **Step 4: Verify the bootstrap imports resolve**

Run:

```powershell
node -e "require.resolve('element-plus'); require.resolve('@element-plus/icons-vue'); require.resolve('vxe-table'); require.resolve('vue-i18n'); console.log('ui bootstrap dependencies resolve')"
```

Expected:

```text
ui bootstrap dependencies resolve
```

- [ ] **Step 5: Commit shared bootstrap and i18n changes**

Run:

```powershell
git add src/vue/bootstrap/installUi.js src/vue/i18n/index.js src/vue/result/i18n/index.js
git commit -m "feat: add vue3 webview bootstrap"
```

Expected: one commit with only bootstrap and i18n files.

---

### Task 4: Convert Vue Entry Points

**Files:**
- Modify: `src/vue/main.js`
- Modify: `src/vue/result/main.js`
- Modify: `src/vue/queryWorkspace/main.js`

**Interfaces:**
- Consumes: `installUi(app, { locale })` and Vue I18n 9 instances from Task 3.
- Produces: three Vue 3 entry points mounted to `#app`.

- [ ] **Step 1: Replace `src/vue/main.js` imports and app creation**

Use this exact top-level structure, preserving the existing component imports and route list:

```js
import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App';
import { i18n } from './i18n/index';
import { installUi } from './bootstrap/installUi';

import '@/../public/theme/auto.css';
import '@/../public/theme/umyui.css';
import 'tailwindcss/tailwind.css';

import connect from './connect';
import status from './status';
import design from './design';
import structDiff from './structDiff';
import keyView from './redis/keyView';
import terminal from './redis/terminal';
import redisStatus from './redis/redisStatus';
import kafkaMessageViewer from './kafka/messageViewer.vue';
import kafkaMessageProducer from './kafka/messageProducer.vue';
import rabbitmqMessageViewer from './rabbitmq/messageViewer.vue';
import rabbitmqMessageProducer from './rabbitmq/messageProducer.vue';
import forward from './forward';
import sshTerminal from './xterm';
import userCenter from './user/userCenter.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/connect', component: connect, name: 'connect' },
    { path: '/status', component: status, name: 'status' },
    { path: '/design', component: design, name: 'design' },
    { path: '/structDiff', component: structDiff, name: 'structDiff' },
    { path: '/keyView', component: keyView, name: 'keyView' },
    { path: '/terminal', component: terminal, name: 'terminal' },
    { path: '/redisStatus', component: redisStatus, name: 'redisStatus' },
    { path: '/kafkaMessageViewer', component: kafkaMessageViewer, name: 'kafkaMessageViewer' },
    { path: '/kafkaMessageProducer', component: kafkaMessageProducer, name: 'kafkaMessageProducer' },
    { path: '/rabbitmqMessageViewer', component: rabbitmqMessageViewer, name: 'rabbitmqMessageViewer' },
    { path: '/rabbitmqMessageProducer', component: rabbitmqMessageProducer, name: 'rabbitmqMessageProducer' },
    { path: '/forward', component: forward, name: 'forward' },
    { path: '/sshTerminal', component: sshTerminal, name: 'sshTerminal' },
    { path: '/userCenter', component: userCenter, name: 'userCenter' }
  ]
});

const app = createApp(App);
installUi(app, { locale: i18n.global.locale });
app.use(router);
app.use(i18n);
app.mount('#app');
```

- [ ] **Step 2: Replace `src/vue/result/main.js`**

Use this exact structure:

```js
import { createApp } from 'vue';
import App from './App';
import Contextmenu from './component/Contextmenu';
import { i18n } from './i18n/index';
import { installUi } from '../bootstrap/installUi';

import '@/../public/theme/auto.css';
import '@/../public/theme/umyui.css';
import './view.css';
import './icon/iconfont.css';

const app = createApp(App);
installUi(app, { locale: i18n.global.locale });
app.use(Contextmenu);
app.use(i18n);
app.mount('#app');
```

- [ ] **Step 3: Replace `src/vue/queryWorkspace/main.js`**

Use this exact structure:

```js
import { createApp } from 'vue';
import App from './App';
import { installUi } from '../bootstrap/installUi';

import '@/../public/theme/auto.css';
import '@/../public/theme/umyui.css';
import '../result/view.css';
import '../result/icon/iconfont.css';

const app = createApp(App);
installUi(app, { locale: 'en' });
app.mount('#app');
```

- [ ] **Step 4: Run the webview build to expose component-level Vue 2 syntax**

Run:

```powershell
npx webpack --config webpack.config.js --mode=development --config-name webview
```

Expected: entry-level errors for `new Vue`, `Vue.use`, `element-ui`, and `umy-table` are gone. The remaining failures should point to Vue components, `ux-grid`, or Contextmenu internals.

- [ ] **Step 5: Commit entry point conversion**

Run:

```powershell
git add src/vue/main.js src/vue/result/main.js src/vue/queryWorkspace/main.js
git commit -m "feat: convert webview entrypoints to vue3"
```

Expected: one commit with only the three entry point files.

---

### Task 5: Migrate Contextmenu Plugin to Vue 3

**Files:**
- Modify: `src/vue/result/component/Contextmenu/index.js`
- Modify: `src/vue/result/component/Contextmenu/components/Contextmenu.vue`
- Modify: `src/vue/result/component/Contextmenu/components/Submenu.vue`

**Interfaces:**
- Consumes: `app.use(Contextmenu)` from `src/vue/result/main.js`.
- Produces: `this.$contextmenu(options)` for existing result table components.

- [ ] **Step 1: Replace plugin runtime in `src/vue/result/component/Contextmenu/index.js`**

Use this file body:

```js
import { createApp, h } from 'vue';
import Contextmenu from './components/Contextmenu';
import Submenu from './components/Submenu';
import { COMPONENT_NAME } from './constant';

function mountContextmenu(options) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const app = createApp({
    render() {
      return h(Contextmenu, {
        items: options.items || [],
        x: options.event ? options.event.clientX : options.x || 0,
        y: options.event ? options.event.clientY : options.y || 0,
        customClass: options.customClass || null,
        minWidth: options.minWidth,
        zIndex: options.zIndex,
        onClose: () => {
          app.unmount();
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
        }
      });
    }
  });

  app.component(COMPONENT_NAME, Submenu);
  app.mount(container);
  return app;
}

function install(app) {
  let lastApp = null;
  const ContextmenuProxy = function (options) {
    ContextmenuProxy.destroy();
    lastApp = mountContextmenu(options || {});
  };

  ContextmenuProxy.destroy = function () {
    if (lastApp) {
      lastApp.unmount();
      lastApp = null;
    }
  };

  app.config.globalProperties.$contextmenu = ContextmenuProxy;
}

export default { install };
```

- [ ] **Step 2: Replace script block in `Contextmenu.vue`**

Use this script block:

```vue
<script>
import Submenu from './Submenu.vue';
import { getElementsByClassName } from '../util';

export default {
  props: {
    items: { type: Array, default: () => [] },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    customClass: { type: String, default: null },
    minWidth: { type: Number, default: 150 },
    zIndex: { type: Number, default: 2 }
  },
  emits: ['close'],
  data() {
    return {
      position: { x: this.x, y: this.y },
      style: { zIndex: this.zIndex, minWidth: this.minWidth },
      mainMenuInstance: null,
      mouseListening: false
    };
  },
  mounted() {
    this.addListener();
  },
  beforeUnmount() {
    this.removeListener();
  },
  methods: {
    mouseClickListener(e) {
      let el = e.target;
      const menus = getElementsByClassName(this.$style.menu);
      const menuItems = getElementsByClassName(this.$style.menu_item);
      const unclickableMenuItems = getElementsByClassName(this.$style.menu_item__unclickable);
      while (!menus.find(m => m === el) && !menuItems.find(m => m === el) && el.parentElement) {
        el = el.parentElement;
      }
      if (menuItems.find(m => m === el)) {
        if (e.button !== 0 || unclickableMenuItems.find(m => m === el)) {
          return;
        }
        this.$emit('close');
        return;
      }
      if (!menus.find(m => m === el)) {
        this.$emit('close');
      }
    },
    addListener() {
      if (!this.mouseListening) {
        document.addEventListener('click', this.mouseClickListener);
        this.mouseListening = true;
      }
    },
    removeListener() {
      if (this.mouseListening) {
        document.removeEventListener('click', this.mouseClickListener);
        this.mouseListening = false;
      }
    }
  },
  components: { Submenu }
};
</script>
```

Also replace the template with:

```vue
<template>
  <Submenu
    :items="items"
    :position="{ x: position.x, y: position.y, width: 0, height: 0 }"
    :style-config="style"
    :custom-class="customClass"
    :common-class="{
      menu: $style.menu,
      menuItem: $style.menu_item,
      clickableMenuItem: $style.menu_item__clickable,
      unclickableMenuItem: $style.menu_item__unclickable
    }"
    @close="$emit('close')"
  />
</template>
```

- [ ] **Step 3: Replace script block in `Submenu.vue`**

Use props instead of creating components through `Vue.component`:

```vue
<script>
import {
  SUBMENU_X_OFFSET,
  SUBMENU_Y_OFFSET,
  SUBMENU_OPEN_TREND_LEFT,
  SUBMENU_OPEN_TREND_RIGHT,
  COMPONENT_NAME
} from '../constant';

export default {
  name: COMPONENT_NAME,
  props: {
    items: { type: Array, default: () => [] },
    position: { type: Object, required: true },
    styleConfig: { type: Object, required: true },
    customClass: { type: String, default: null },
    commonClass: { type: Object, required: true },
    openTrendValue: { type: String, default: SUBMENU_OPEN_TREND_RIGHT }
  },
  emits: ['close'],
  data() {
    return {
      activeSubmenu: { index: null, item: null, position: null },
      style: {
        left: 0,
        top: 0,
        zIndex: this.styleConfig.zIndex,
        minWidth: this.styleConfig.minWidth
      },
      visible: false,
      hasIcon: false,
      openTrend: this.openTrendValue
    };
  },
  mounted() {
    this.visible = true;
    this.hasIcon = this.items.some(item => item.icon);
    this.$nextTick(() => {
      const windowWidth = document.documentElement.clientWidth;
      const windowHeight = document.documentElement.clientHeight;
      const menu = this.$refs.menu;
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      (this.openTrend === SUBMENU_OPEN_TREND_LEFT ? this.leftOpen : this.rightOpen)(windowWidth, windowHeight, menuWidth);
      this.style.top = this.position.y;
      if (this.position.y + menuHeight > windowHeight) {
        this.style.top = this.position.height === 0 ? this.position.y - menuHeight : windowHeight - menuHeight;
      }
    });
  },
  methods: {
    leftOpen(windowWidth, windowHeight, menuWidth) {
      this.style.left = this.position.x - menuWidth;
      this.openTrend = SUBMENU_OPEN_TREND_LEFT;
      if (this.style.left < 0) {
        this.openTrend = SUBMENU_OPEN_TREND_RIGHT;
        this.style.left = this.position.width === 0 ? 0 : this.position.x + this.position.width;
      }
    },
    rightOpen(windowWidth, windowHeight, menuWidth) {
      this.style.left = this.position.x + this.position.width;
      this.openTrend = SUBMENU_OPEN_TREND_RIGHT;
      if (this.style.left + menuWidth > windowWidth) {
        this.openTrend = SUBMENU_OPEN_TREND_LEFT;
        this.style.left = this.position.width === 0 ? windowWidth - menuWidth : this.position.x - menuWidth;
      }
    },
    enterItem(e, item, index) {
      if (!this.visible || !item.children) {
        this.activeSubmenu = { index: null, item: null, position: null };
        return;
      }
      if (this.activeSubmenu.index === index) {
        return;
      }
      const rect = e.target.getBoundingClientRect();
      this.activeSubmenu = {
        index,
        item,
        position: {
          x: rect.x + SUBMENU_X_OFFSET,
          y: rect.y + SUBMENU_Y_OFFSET,
          width: rect.width - 2 * SUBMENU_X_OFFSET,
          height: rect.width
        }
      };
    },
    itemClick(item) {
      if (this.visible && item && !item.disabled && !item.hidden && typeof item.onClick === 'function') {
        item.onClick();
        this.$emit('close');
      }
    },
    close() {
      this.visible = false;
      this.$emit('close');
    }
  }
};
</script>
```

Add this recursive submenu block inside the existing available child item branch:

```vue
<Submenu
  v-if="activeSubmenu.index === index && activeSubmenu.item"
  :items="activeSubmenu.item.children"
  :position="activeSubmenu.position"
  :style-config="{ minWidth: typeof item.minWidth === 'number' ? item.minWidth : style.minWidth, zIndex: style.zIndex }"
  :custom-class="typeof item.customClass === 'string' ? item.customClass : customClass"
  :common-class="commonClass"
  :open-trend-value="openTrend"
  @close="$emit('close')"
/>
```

- [ ] **Step 4: Verify Contextmenu no longer imports Vue**

Run:

```powershell
rg -n "import Vue|Vue\\.extend|Vue\\.component|\\$destroy|destroyed\\(" src/vue/result/component/Contextmenu
```

Expected: no matches.

- [ ] **Step 5: Commit Contextmenu migration**

Run:

```powershell
git add src/vue/result/component/Contextmenu
git commit -m "feat: migrate context menu to vue3"
```

Expected: one commit with Contextmenu files only.

---

### Task 6: Migrate Result Table to vxe-table

**Files:**
- Modify: `src/vue/result/App.vue`
- Modify: `src/vue/result/component/ExportDialog.vue`
- Modify: `src/vue/result/component/EditDialog/index.vue`
- Modify: `src/vue/result/component/Toolbar/index.vue`
- Modify as needed: `src/vue/result/component/Row/Controller.vue`
- Modify as needed: `src/vue/result/component/Row/Header.vue`
- Modify as needed: `src/vue/result/component/Row/index.vue`

**Interfaces:**
- Consumes: vxe-table global registration from `installUi`.
- Produces: result table behavior with data display, checkbox selection, sort changes, row slots, editor dialog, export dialog, and toolbar updates.

- [ ] **Step 1: Change result page dialog and child component bindings**

In `src/vue/result/App.vue`, replace these bindings:

```vue
:filters.sync="toolbar.conditionFilters"
```

with:

```vue
v-model:filters="toolbar.conditionFilters"
```

Replace:

```vue
<el-dialog :title="$t('Result')" :visible.sync="resultDialog" top="5vh" size="default" @close="closeResult">
```

with:

```vue
<el-dialog :title="$t('Result')" v-model="resultDialog" top="5vh" @close="closeResult">
```

Replace:

```vue
<Toolbar style="flex: 1;" :showFullBtn="showFullBtn" :search.sync="table.search"
```

with:

```vue
<Toolbar style="flex: 1;" :showFullBtn="showFullBtn" v-model:search="table.search"
```

Replace:

```vue
<ExportDialog :visible.sync="exportOption.visible" @exportHandle="confirmExport" />
```

with:

```vue
<ExportDialog v-model:visible="exportOption.visible" @exportHandle="confirmExport" />
```

- [ ] **Step 2: Replace the `ux-grid` block in `src/vue/result/App.vue`**

Replace the full `<ux-grid ref="dataTable" ... </ux-grid>` block with:

```vue
<vxe-table
  ref="dataTable"
  :data="filterData"
  v-loading="table.loading"
  size="small"
  :row-config="{ isHover: true }"
  :column-config="{ resizable: true }"
  :checkbox-config="{ checkMethod: selectable }"
  :height="remainHeight"
  width="100vw"
  stripe
  border
  @sort-change="sort"
>
  <vxe-column type="checkbox" width="40" fixed="left" align="center"></vxe-column>
  <vxe-column type="seq" width="40" align="center">
    <template #header>
      <Controller :result="result" :toolbar="toolbar" />
    </template>
  </vxe-column>
  <vxe-column
    v-for="(field, index) in (result.fields || []).filter(field => toolbar.showColumns.includes(field.name.toLowerCase()))"
    :key="field.name || index"
    :field="field.name"
    :title="field.name"
    sortable
    :min-width="computeWidth(field, 0)"
  >
    <template #header="scope">
      <Header :result="result" :scope="scope" :index="index" />
    </template>
    <template #default="scope">
      <Row
        :scope="scope"
        :result="result"
        :filterObj="toolbar.filter"
        :editList="update.editList"
        @update:editList="update.editList = $event"
        @execute="execute"
        @sendToVscode="sendToVscode"
        @openEditor="openEditor"
      />
    </template>
  </vxe-column>
</vxe-table>
```

- [ ] **Step 3: Update selection access in `src/vue/result/App.vue`**

Find every use of the old table selection API on `this.$refs.dataTable`. Replace it with this helper method:

```js
getSelectedRows() {
  const table = this.$refs.dataTable;
  if (!table) {
    return [];
  }
  if (typeof table.getCheckboxRecords === 'function') {
    return table.getCheckboxRecords();
  }
  if (typeof table.getSelectRecords === 'function') {
    return table.getSelectRecords();
  }
  return [];
}
```

Then update delete/export/edit callers to use `this.getSelectedRows()`.

- [ ] **Step 4: Replace `src/vue/result/component/ExportDialog.vue` template**

Use this dialog shape:

```vue
<template>
  <el-dialog :title="$t('Export Option')" :model-value="visible" width="580px" top="6vh" @close="$emit('update:visible', false)">
    <el-form :model="exportOption">
      <el-form-item :label="$t('Export File Type')">
        <el-select v-model="exportOption.type" size="small">
          <el-option label="Sql" value="sql"></el-option>
          <el-option label="Xlsx" value="xlsx"></el-option>
          <el-option label="Json" value="json"></el-option>
          <el-option label="Csv" value="csv"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item :label="$t('Remove Limit')">
        <el-switch v-model="exportOption.withOutLimit"></el-switch>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button type="primary" size="default" :loading="loading" @click="loading = true; $emit('exportHandle', exportOption);">
          {{ $t('Export') }}
        </el-button>
        <el-button @click="$emit('update:visible', false)" size="default">
          {{ $t('Cancel') }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>
```

- [ ] **Step 5: Update `src/vue/result/component/EditDialog/index.vue` dialog syntax**

Replace:

```vue
<el-dialog ref="editDialog" :title="editorTilte" :visible.sync="visible"
  width="70%" top="50px" size="mini" :closeOnClickModal="false">
```

with:

```vue
<el-dialog ref="editDialog" :title="editorTilte" v-model="visible"
  width="70%" top="50px" :close-on-click-modal="false">
```

Replace the footer span with a Vue 3 footer slot:

```vue
<template #footer>
  <span class="dialog-footer">
    <el-button size="default" @click="visible = false">{{ $t('Cancel') }}</el-button>
    <el-button v-if="model == 'update'" type="primary" size="default" :loading="loading" @click="confirmUpdate(editModel)">
      {{ $t('Update') }}
    </el-button>
    <el-button v-if="model == 'insert' || model == 'copy'" size="default" type="primary" :loading="loading" @click="confirmInsert(editModel)">
      {{ $t('Insert') }}
    </el-button>
  </span>
</template>
```

Replace scoped deep selectors:

```css
::v-deep .el-dialog__body
```

with:

```css
:deep(.el-dialog__body)
```

Apply the same `:deep(...)` conversion to each `::v-deep` selector in the file.

- [ ] **Step 6: Replace toolbar icon classes with Element Plus icon components**

In `src/vue/result/component/Toolbar/index.vue`, add:

```js
import { Delete, Download, Edit, FullScreen, Plus } from '@element-plus/icons-vue';
```

and register:

```js
components: { Delete, Download, Edit, FullScreen, Plus },
```

Replace icon class usage in buttons with:

```vue
<el-icon><FullScreen /></el-icon>
<el-icon><Plus /></el-icon>
<el-icon><Delete /></el-icon>
<el-icon><Download /></el-icon>
<el-icon><Edit /></el-icon>
```

- [ ] **Step 7: Run result webview build**

Run:

```powershell
npx webpack --config webpack.config.js --mode=development --config-name webview
```

Expected: no failures remain in `src/vue/result/App.vue`, `ExportDialog.vue`, `EditDialog/index.vue`, or `Toolbar/index.vue`. Remaining failures should point to non-result pages or global syntax.

- [ ] **Step 8: Commit result table migration**

Run:

```powershell
git add src/vue/result
git commit -m "feat: migrate result table to vxe-table"
```

Expected: one commit containing result page and result component changes.

---

### Task 7: Migrate Query Workspace and Smaller vxe-table Grids

**Files:**
- Modify: `src/vue/queryWorkspace/App.vue`
- Modify: `src/vue/design/ColumnPanel.vue`
- Modify: `src/vue/design/IndexPanel.vue`
- Modify: `src/vue/status/index.vue`
- Modify: `src/vue/structDiff/index.vue`

**Interfaces:**
- Consumes: global vxe-table registration from `installUi`.
- Produces: all previous `ux-grid` usages replaced by vxe-table.

- [ ] **Step 1: Replace query workspace grid**

In `src/vue/queryWorkspace/App.vue`, replace the `ux-grid` block with:

```vue
<vxe-table
  ref="dataTable"
  :data="filterData"
  v-loading="loading"
  size="small"
  :height="remainHeight"
  width="100vw"
  stripe
  border
>
  <vxe-column type="seq" width="48" align="center"></vxe-column>
  <vxe-column
    v-for="field in result.fields || []"
    :key="field.name"
    :field="field.name"
    :title="field.name"
    :min-width="computeWidth(field, 0)"
    :resizable="true"
  >
    <template #default="scope">
      <span v-if="scope.row[field.name] === null || scope.row[field.name] === undefined" class="null-column">(NULL)</span>
      <span v-else>{{ formatValue(scope.row[field.name]) }}</span>
    </template>
  </vxe-column>
</vxe-table>
```

Replace:

```vue
<el-dialog title="Result" :visible.sync="resultDialog" top="5vh">
```

with:

```vue
<el-dialog title="Result" v-model="resultDialog" top="5vh">
```

Replace:

```vue
<ExportDialog :visible.sync="exportOption.visible" @exportHandle="confirmExport" />
```

with:

```vue
<ExportDialog v-model:visible="exportOption.visible" @exportHandle="confirmExport" />
```

Replace `beforeDestroy()` with `beforeUnmount()`.

- [ ] **Step 2: Replace design index grid**

In `src/vue/design/IndexPanel.vue`, replace:

```vue
<ux-grid :data="designData.editIndex" stripe style="width: 100%" :cell-style="{height: '35px'}">
```

with:

```vue
<vxe-table :data="designData.editIndex" stripe border style="width: 100%" :row-config="{ height: 35 }">
```

Replace each `ux-table-column` with `vxe-column` preserving `field`, `title`, and width props. Replace:

```vue
</ux-grid>
```

with:

```vue
</vxe-table>
```

Replace dialog visibility:

```vue
<el-dialog :title="$t('Add Index')" :visible.sync="index.visible" top="5vh" size="mini">
```

with:

```vue
<el-dialog :title="$t('Add Index')" v-model="index.visible" top="5vh">
```

- [ ] **Step 3: Replace design column grid**

In `src/vue/design/ColumnPanel.vue`, replace the opening grid:

```vue
<ux-grid ref="uxGrid" :data="designData.editColumnList" stripe keep-source style="width: 100%" :edit-config="{trigger: 'click', mode: 'cell'}"
```

with:

```vue
<vxe-table ref="uxGrid" :data="designData.editColumnList" stripe border keep-source style="width: 100%" :edit-config="{ trigger: 'click', mode: 'cell' }"
```

Replace `ux-table-column` tags with `vxe-column` tags. For edit columns, preserve the existing scoped templates using Vue 3 slot syntax:

```vue
<template #default="scope">
  <!-- keep the existing cell body -->
</template>
```

Replace all `</ux-grid>` with `</vxe-table>`.

Replace dialogs:

```vue
:visible.sync="column.editVisible"
:visible.sync="column.visible"
```

with:

```vue
v-model="column.editVisible"
v-model="column.visible"
```

Replace:

```js
import { Loading } from 'element-ui';
```

with:

```js
import { ElLoading } from 'element-plus';
```

Replace `Loading.service(` with `ElLoading.service(`.

- [ ] **Step 4: Replace status grids**

In `src/vue/status/index.vue`, replace each `ux-grid` block with:

```vue
<vxe-table :data="process.rows" size="small" :row-config="{ height: 35 }" style="width: 100%" :height="remainHeight()" border stripe>
  <vxe-column v-for="column in process.columns" :key="column.field" :field="column.field" :title="column.title"></vxe-column>
</vxe-table>
```

For `variableList.rows` and `statusList.rows`, use the same structure but replace `process` with `variableList` and `statusList`.

- [ ] **Step 5: Replace structure diff grid**

In `src/vue/structDiff/index.vue`, replace:

```vue
<ux-grid :data="compareResult.sqlList" :height="remainHeight" ref="dataTable" stripe style="width: 100%" @selection-change="selectionChange">
```

with:

```vue
<vxe-table
  :data="compareResult.sqlList"
  :height="remainHeight"
  ref="dataTable"
  stripe
  border
  style="width: 100%"
  @checkbox-change="selectionChange"
  @checkbox-all="selectionChange"
>
```

Replace checkbox columns with:

```vue
<vxe-column type="checkbox" width="48"></vxe-column>
```

Replace other `ux-table-column` tags with `vxe-column` tags and close with `</vxe-table>`.

- [ ] **Step 6: Verify no `ux-grid` remains**

Run:

```powershell
rg -n "ux-grid|ux-table-column|umy-table" src/vue package.json
```

Expected: no matches.

- [ ] **Step 7: Run webview build**

Run:

```powershell
npx webpack --config webpack.config.js --mode=development --config-name webview
```

Expected: no failures from `ux-grid`, `ux-table-column`, `umy-table`, or `element-ui`.

- [ ] **Step 8: Commit smaller grid migrations**

Run:

```powershell
git add src/vue/queryWorkspace/App.vue src/vue/design/ColumnPanel.vue src/vue/design/IndexPanel.vue src/vue/status/index.vue src/vue/structDiff/index.vue
git commit -m "feat: migrate webview grids to vxe-table"
```

Expected: one commit containing non-result grid migrations.

---

### Task 8: Finish Vue 3 Template and Element Plus Compatibility

**Files:**
- Modify: files under `src/vue/**/*.vue`
- Modify as needed: files under `src/vue/**/*.js`

**Interfaces:**
- Consumes: Vue 3 entry points, Element Plus bootstrap, and vxe-table migration from prior tasks.
- Produces: webview source with no Vue 2-only syntax.

- [ ] **Step 1: Replace remaining `.sync` usage**

Run:

```powershell
rg -n "\.sync|update:" src/vue --glob "*.vue"
```

For each remaining `.sync`, convert to Vue 3 model syntax. Use these exact mappings:

```text
:visible.sync="x" -> v-model:visible="x" when the child prop is named visible
:search.sync="x" -> v-model:search="x" when the child prop is named search
:filters.sync="x" -> v-model:filters="x" when the child prop is named filters
:editList.sync="x" -> :editList="x" @update:editList="x = $event"
:visible.sync on el-dialog -> v-model="x"
```

Expected: `rg -n "\.sync" src/vue --glob "*.vue"` returns no matches.

- [ ] **Step 2: Replace remaining old slot syntax**

Run:

```powershell
rg -n "slot-scope|slot=\"header\"| slot=" src/vue --glob "*.vue"
```

Use these exact replacements:

```text
<template slot-scope="scope"> -> <template #default="scope">
<template slot="header" slot-scope="scope"> -> <template #header="scope">
<span slot="footer"> -> <template #footer><span>
</span> after a footer slot -> </span></template>
```

Expected: `rg -n "slot-scope|slot=\"header\"| slot=" src/vue --glob "*.vue"` returns no Vue slot matches.

- [ ] **Step 3: Replace remaining lifecycle hooks**

Run:

```powershell
rg -n "beforeDestroy|destroyed\\(" src/vue --glob "*.vue" --glob "*.js"
```

Use these replacements:

```text
beforeDestroy() -> beforeUnmount()
destroyed() -> unmounted()
this.$once('hook:beforeDestroy', fn) -> call fn from beforeUnmount or register a local cleanup method
```

Expected: no `beforeDestroy` or `destroyed(` matches remain.

- [ ] **Step 4: Remove `.native` event modifiers**

Run:

```powershell
rg -n "\\.native" src/vue --glob "*.vue"
```

Use this replacement:

```text
@keypress.native="panelInput" -> @keypress="panelInput"
@click.native="handler" -> @click="handler"
```

Expected: no `.native` matches remain.

- [ ] **Step 5: Replace Element UI icon string props and classes**

Run:

```powershell
rg -n "el-icon-" src/vue --glob "*.vue"
```

Use these Element Plus icon mappings:

```text
el-icon-check -> Check
el-icon-circle-plus-outline -> CirclePlus
el-icon-delete -> Delete
el-icon-edit -> Edit
el-icon-download -> Download
el-icon-caret-right -> CaretRight
el-icon-rank -> FullScreen
```

For button icon props, replace:

```vue
<el-button icon="el-icon-delete">
```

with:

```vue
<el-button :icon="Delete">
```

and import/register the icon component:

```js
import { Delete } from '@element-plus/icons-vue';

export default {
  components: { Delete }
};
```

For inline `<i class="el-icon-delete"></i>`, replace with:

```vue
<el-icon><Delete /></el-icon>
```

Expected: no `el-icon-` matches remain except custom icon font classes that are not Element UI classes.

- [ ] **Step 6: Replace remaining element-ui imports**

Run:

```powershell
rg -n "element-ui|ElementUI|locale/lang" src/vue package.json
```

Expected: no matches. If a match imports a UI service, replace it with the equivalent Element Plus named import:

```js
import { ElLoading, ElMessage, ElMessageBox } from 'element-plus';
```

- [ ] **Step 7: Convert deep selectors**

Run:

```powershell
rg -n "::v-deep|>>>" src/vue --glob "*.vue"
```

Use these replacements:

```text
::v-deep .selector -> :deep(.selector)
>>> .selector -> :deep(.selector)
```

Expected: no `::v-deep` or `>>>` matches remain.

- [ ] **Step 8: Run full webview build**

Run:

```powershell
npx webpack --config webpack.config.js --mode=development --config-name webview
```

Expected: webview build succeeds.

- [ ] **Step 9: Commit compatibility pass**

Run:

```powershell
git add src/vue
git commit -m "feat: finish vue3 element plus compatibility"
```

Expected: one commit containing remaining Vue 3 and Element Plus source compatibility changes.

---

### Task 9: Update Publish Script and Developer Documentation

**Files:**
- Modify: `publish.sh`
- Modify: `DEVELOP.md`

**Interfaces:**
- Consumes: successful Node 20 build from previous tasks.
- Produces: release flow that no longer depends on Node 16 or OpenSSL legacy provider.

- [ ] **Step 1: Update Node defaults in `publish.sh`**

Replace:

```bash
NODE_BUILD_VERSION="${NODE_BUILD_VERSION:-16.20.2}"
NODE_PUBLISH_VERSION="${NODE_PUBLISH_VERSION:-20.20.2}"
```

with:

```bash
NODE_VERSION="${NODE_VERSION:-20.20.2}"
NODE_BUILD_VERSION="${NODE_BUILD_VERSION:-$NODE_VERSION}"
NODE_PUBLISH_VERSION="${NODE_PUBLISH_VERSION:-$NODE_VERSION}"
```

Expected: existing environment overrides still work, and default build/publish use the same Node 20 version.

- [ ] **Step 2: Update `DEVELOP.md` packaging section**

Replace the old Node/OpenSSL packaging paragraph with:

```markdown
### 代码打包

构建、打包、发布统一使用 Node 20+。

```bash
nvm use 20.20.2
npm ci
npm run build
npx @vscode/vsce package --allow-star-activation
```

发布脚本会自动切换到 `NODE_VERSION`，默认 `20.20.2`：

```bash
PUBLISH_DRY_RUN=1 bash ./publish.sh
bash ./publish.sh
```
```

- [ ] **Step 3: Verify dry-run publish does not request Node 16**

Run:

```powershell
bash -lc "PUBLISH_DRY_RUN=1 ./publish.sh"
```

Expected: log lines show `Checking Node 20.20.2`, `Building with Node 20.20.2`, and `Packaging with Node 20.20.2`. The script stops after package creation because `PUBLISH_DRY_RUN=1`.

- [ ] **Step 4: Commit publish documentation changes**

Run:

```powershell
git add publish.sh DEVELOP.md
git commit -m "build: unify publish flow on node20"
```

Expected: one commit containing only publish script and documentation updates.

---

### Task 10: Final Build, Package, and Smoke Validation

**Files:**
- Modify as needed: `webpack.config.js`
- Modify as needed: `src/vue/**/*.vue`
- Modify as needed: `src/vue/**/*.js`

**Interfaces:**
- Consumes: all prior migration tasks.
- Produces: a buildable and packageable VS Code extension with migrated webviews.

- [ ] **Step 1: Run clean production build**

Run:

```powershell
npm run build
```

Expected: production build succeeds and emits:

```text
out/extension.js
out/webview/app.html
out/webview/result.html
out/webview/queryWorkspace.html
out/webview/js/app.js
out/webview/js/query.js
out/webview/js/queryWorkspace.js
```

- [ ] **Step 2: Check for removed packages and Vue 2 syntax**

Run:

```powershell
rg -n "element-ui|umy-table|vue-template-compiler|new Vue|Vue.use|Vue.extend|slot-scope|beforeDestroy|\\.sync|\\.native|ux-grid|ux-table-column" package.json src/vue webpack.config.js
```

Expected: no matches, except harmless text inside comments that should be removed before committing.

- [ ] **Step 3: Package extension**

Run:

```powershell
npx @vscode/vsce package --allow-star-activation
```

Expected: a new `airdb-<version>.vsix` is produced.

- [ ] **Step 4: Run publish dry-run**

Run:

```powershell
bash -lc "PUBLISH_DRY_RUN=1 ./publish.sh"
```

Expected: script builds and packages using Node 20 and prints `Dry run enabled. Skipping publish. Package ready: airdb-<new-version>.vsix`.

- [ ] **Step 5: Manual VS Code smoke checks**

Run the extension in VS Code debug mode and check:

```text
Extension activates without webview console errors.
Connection page renders.
Result table page renders.
Query workspace page renders.
A simple SQL query displays rows.
Result table sorting works.
Result table pagination works.
Result export dialog opens and emits export.
Basic edit dialog opens from result table.
Design column grid renders.
Design index grid renders.
Status page grids and charts render.
```

- [ ] **Step 6: Inspect final status**

Run:

```powershell
git status --short
```

Expected: only intended migration files and generated VSIX artifacts appear. Do not stage `logs/`. Stage generated VSIX only if the release policy for this repository requires committing packages.

- [ ] **Step 7: Commit final fixes**

Run:

```powershell
git add package.json package-lock.json webpack.config.js webpack.config.lib.js publish.sh DEVELOP.md src/vue
git commit -m "feat: upgrade webviews to vue3 element plus"
```

Expected: this commit contains only final source fixes that were not already committed by earlier tasks.

---

## Self Review

- Spec coverage: dependency upgrade is Task 1; Webpack 5 is Task 2; Vue 3 entry points, router, and i18n are Tasks 3 and 4; Contextmenu is Task 5; vxe-table migration is Tasks 6 and 7; remaining Element Plus/Vue syntax compatibility is Task 8; publish script and docs are Task 9; build/package/dry-run/manual validation is Task 10.
- Scope check: no database driver migration, UI redesign, or Vite migration is included.
- Type consistency: shared installer is `installUi(app, options)`, and all entry points consume that same function.
- Output consistency: all required `out` paths remain unchanged in the Webpack config.
- Incomplete marker scan: the plan avoids open-ended markers and each task includes concrete commands and expected outcomes.
