# 开发步骤

## 本地调试

用vscode打开项目根目录，点击菜单-运行-启动调试，即可自动开始，会打开一个新的VSCODE窗口，里面装好了开发版本插件。

## 打包发布

### Personal Access Token
https://code.visualstudio.com/api/working-with-extensions/publishing-extension

### 代码打包

node版本需要20+

$env:NODE_OPTIONS="--openssl-legacy-provider" 
或
set NODE_OPTIONS=--openssl-legacy-provider
 
补充:
在终端输入一次只能本次生效，如果想永久生效可以在 package.json 文件中修改对应的 scripts 节点的内容如下：
 
"serve": "SET NODE_OPTIONS=--openssl-legacy-provider && vue-cli-service serve",
"build": "SET NODE_OPTIONS=--openssl-legacy-provider && vue-cli-service build",

```
nvm use 20
npm i g @vscode/vsce
vsce login [ms-userid]
vsce package
vsce publish
```

## pg-native

#### 需要windows-sdk编译

https://developer.microsoft.com/zh-cn/windows/downloads/sdk-archive/

### 安装依赖

npm i  pg-native --save