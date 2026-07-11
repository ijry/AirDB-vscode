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
    // mongodb@3.x uses optional-require(require); critical-dependency noise is harmless
    ignoreWarnings: [
      {
        module: /node_modules[\\/]mongodb[\\/]/,
        message: /Critical dependency/
      }
    ],
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    plugins: [
      new webpack.IgnorePlugin({
        resourceRegExp: /^(pg-native|cardinal|encoding|aws4|snappy|snappyjs)$/
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
