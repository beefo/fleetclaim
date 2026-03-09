const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

const ADDIN_NAME = 'fleetclaim-drive';

module.exports = merge(common, {
    mode: 'production',
    devtool: 'source-map',
    output: {
        filename: `${ADDIN_NAME}.[contenthash:8].js`,
        path: path.resolve(__dirname, 'dist'),
        clean: true
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader']
            }
        ]
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: `${ADDIN_NAME}.[contenthash:8].css`
        }),
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, 'app/index.html'),
            filename: 'index.html',
            inject: true,
            minify: {
                removeComments: true,
                collapseWhitespace: true
            }
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'config.json', to: 'config.json' },
                { from: 'images', to: 'images', noErrorOnMissing: true }
            ]
        })
    ],
    optimization: {
        minimize: true
    }
});
