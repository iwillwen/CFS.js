const webpack = require('webpack')

module.exports = {
  entry: './src/entry.js',
  output: {
    filename: 'cfs.js',
    path: __dirname + '/dist',
    libraryTarget: 'umd',
    library: 'CFS'
  },
  devtool: 'source-map',
  resolve: {
    extensions: [ ".webpack.js", ".ts" ]
  },
  module: {
    loaders: [
      {
        test: /\.ts$/,
        loader: "ts-loader"
      }
    ]
  }
}