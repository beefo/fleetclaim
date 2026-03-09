const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'inline-source-map',
    entry: './.dev/index.tsx',
    context: path.join(__dirname),
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, '.dev/index.html'),
            inject: true
        })
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist')
        },
        compress: true,
        port: 9001,
        hot: true,
        open: true,
        headers: {
            'Access-Control-Allow-Origin': '*'
        }
    }
});
