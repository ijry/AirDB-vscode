# 开发步骤

## 本地调试

用vscode打开项目根目录，点击菜单-运行-启动调试，即可自动开始，会打开一个新的VSCODE窗口，里面装好了开发版本插件。

## 打包发布

### Personal Access Token
https://code.visualstudio.com/api/working-with-extensions/publishing-extension

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

## pg-native

#### 需要windows-sdk编译

https://developer.microsoft.com/zh-cn/windows/downloads/sdk-archive/

### 安装依赖

npm i  pg-native --save
