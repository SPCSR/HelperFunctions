var webpack = require("webpack");
// Check for production parameter
var PROD = process.argv.indexOf('-p') !== -1;
module.exports = {
    //devtool: 'eval',
    entry: './search.queryVariableInjector.ts',
    output: {
        path: __dirname,
        filename: PROD ? 'search.queryVariableInjector.min.js' : 'search.queryVariableInjector.js',
    },
    module: {
        loaders: [
            { test: /\.tsx?$/, loader: 'ts-loader' }
        ]
    },
    watch: true
};