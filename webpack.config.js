const path = require('path');
const { VueLoaderPlugin } = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const isProd = process.argv.indexOf('--mode=production') >= 0;
var webpack = require('webpack');

module.exports = [
    {
        target: "node",
        node: {
            global: true,
            __dirname: true,
            __filename: true,
        },
        // node: {
        //     fs: 'empty', net: 'empty', tls: 'empty',
        //     child_process: 'empty', dns: 'empty',
        //     global: true, __dirname: true
        // },
        entry: ['./src/extension.ts'],
        output: {
            path: path.resolve(__dirname, 'out'),
            filename: 'extension.js',
            libraryTarget: 'commonjs2',
            devtoolModuleFilenameTemplate: '[absoluteResourcePath]',
        },
        externals: {
            vscode: 'commonjs vscode',
            mockjs: 'mockjs vscode',
            'mongodb-client-encryption':'mongodb-client-encryption'
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: {
                '@': path.resolve(__dirname, './src')
            },
            // webpack5+ need this
            fallback: {
                "process": require.resolve("process/browser")
            }
        },
        plugins: [
            // new webpack.IgnorePlugin(/^(pg-native|cardinal|encoding|aws4)$/)
            new webpack.IgnorePlugin({resourceRegExp: /'^(pg-native|cardinal|encoding|aws4)$'/})
        ],
        module: {
            //解决Critical dependency: require function is used in a way in which dependencies cannot be statically extracted的问题
            unknownContextCritical : false,
            rules: [{ test: /\.ts$/, exclude: /(node_modules|bin)/, use: ['ts-loader'] }]
        },
        optimization: { minimize: isProd },
        watch: !isProd,
        mode: isProd ? 'production' : 'development',
        devtool: isProd ? false : 'source-map',
    },
    {
        entry: {
            app: './src/vue/main.js',
            query: './src/vue/result/main.js'
        },
        plugins: [
            new VueLoaderPlugin(),
            new HtmlWebpackPlugin({ inject: true, template: './public/index.html', chunks: ['app'], filename: 'webview/app.html' }),
            new HtmlWebpackPlugin({ inject: true, 
                templateContent: `<head><script src="js/oldCompatible.js"></script></head><body> <div id="app"></div> </body>`,
                chunks: ['query'],
                filename: 'webview/result.html'
            }),
            new CopyWebpackPlugin({
                patterns: [{ from: 'public', to: './webview' }]
            }),
        ],
        output: {
            path: path.resolve(__dirname, 'out'),
            filename: 'webview/js/[name].js'
        },
        resolve: {
            extensions: ['.vue', '.js'],
            alias: { 'vue$': 'vue/dist/vue.esm.js', '@': path.resolve('src'), }
        },
        module: {
            //解决Critical dependency: require function is used in a way in which dependencies cannot be statically extracted的问题
            unknownContextCritical : false,
            rules: [
                { test: /\.vue$/, loader: 'vue-loader', options: { loaders: { css: ["vue-style-loader", "css-loader"] } } },
                { test: /(\.css|\.cssx)$/, use: ["vue-style-loader", "css-loader", { loader: "postcss-loader" }] },
                { test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/, loader: 'url-loader', options: { limit: 80000 } }
            ]
        },
        optimization: {
            minimize: isProd,
            splitChunks: {
                cacheGroups: {
                    antv: { name: "antv", test: /[\\/]@antv[\\/]/, chunks: "all", priority: 10 },
                    vendor: { name: "vendor", test: /[\\/]node_modules[\\/]/, chunks: "all", priority: -1 }
                }
            }
        },
        watch: !isProd,
        mode: isProd ? 'production' : 'development',
        devtool: isProd ? false : 'source-map',
    }
];
