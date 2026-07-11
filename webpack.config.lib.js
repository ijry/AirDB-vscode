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
