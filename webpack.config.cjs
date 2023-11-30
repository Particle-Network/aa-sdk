/* eslint-disable */
const path = require('path');
const webpack = require('webpack');
let { name, version } = require('./package.json');
name = name.split('/').pop();
module.exports = {
    entry: './src/index.ts',
    output: {
        path: `${__dirname}/dist/${version}`,
        filename: `${name}.min.js`,
        sourceMapFilename: `${name}.min.map`,
        library: 'particleAA',
        libraryTarget: 'this',
        globalObject: 'this',
    },
    node: false,
    devtool: 'source-map',
    mode: 'production',
    target: 'web',
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: ['babel-loader', 'ts-loader'],
                exclude: [path.resolve(__dirname, 'node_modules')],
            },
        ],
    },
    externals: [],
    plugins: [
        new webpack.DefinePlugin({
            'process.env': JSON.stringify(process.env),
            global: this,
        }),
    ],
    resolve: {
        extensions: ['.ts', '.js'],
    },
};
