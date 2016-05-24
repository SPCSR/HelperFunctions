var webpack = require("webpack");

module.exports = {
    //devtool: 'eval',
    entry: './search.queryVariableInjector.ts',
    output: {
        path: __dirname,
        filename: 'search.queryVariableInjector.js',
    },
    module: {
        loaders: [
            { test: /\.tsx?$/, loader: 'ts-loader' }
        ]
    },
    watch: true
};