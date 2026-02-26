const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'inline-source-map',
    // Override entry for dev mode
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
        port: 9000,
        hot: true,
        open: true,
        // Allow CORS for dev
        headers: {
            'Access-Control-Allow-Origin': '*'
        },
        // Proxy API calls to backend
        proxy: [
            {
                context: ['/api'],
                target: 'https://fleetclaim-api-589116575765.us-central1.run.app',
                changeOrigin: true,
                secure: true
            }
        ]
    }
});
