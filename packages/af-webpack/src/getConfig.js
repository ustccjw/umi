import webpack from 'webpack';
import CaseSensitivePathsPlugin from 'case-sensitive-paths-webpack-plugin';
import SystemBellWebpackPlugin from 'system-bell-webpack-plugin';
import WatchMissingNodeModulesPlugin from 'react-dev-utils/WatchMissingNodeModulesPlugin';
import ExtractTextPlugin from 'extract-text-webpack-plugin';
import autoprefixer from 'autoprefixer';
import { dirname, resolve, join } from 'path';
import { existsSync } from 'fs';
import eslintFormatter from 'react-dev-utils/eslintFormatter';
import assert from 'assert';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { sync as resolveSync } from 'resolve';
import uglifyJSConfig from './defaultConfigs/uglifyJS';
import babelConfig from './defaultConfigs/babel';
import defaultBrowsers from './defaultConfigs/browsers';
import stringifyObject from './stringifyObject';
import normalizeTheme from './normalizeTheme';
import { applyWebpackConfig } from './applyWebpackConfig';
import readRc from './readRc';

const debug = require('debug')('af-webpack:getConfig');

export default function getConfig(opts = {}) {
  assert(opts.cwd, 'opts.cwd must be specified');
  assert(opts.outputPath, 'opts.outputPath must be specified');

  const isDev = process.env.NODE_ENV === 'development';
  const theme = normalizeTheme(opts.theme);
  const postcssOptions = {
    // Necessary for external CSS imports to work
    // https://github.com/facebookincubator/create-react-app/issues/2677
    ident: 'postcss',
    plugins: () => [
      require('postcss-flexbugs-fixes'),
      autoprefixer({
        browsers: opts.browserslist || defaultBrowsers,
        flexbox: 'no-2009',
      }),
      ...(opts.extraPostCSSPlugins ? opts.extraPostCSSPlugins : []),
    ],
  };
  const cssModulesConfig = opts.disableCSSModules
    ? {}
    : {
        modules: true,
        localIdentName: '[local]___[hash:base64:5]',
      };
  const lessOptions = {
    modifyVars: theme,
  };
  const cssOptions = {
    importLoaders: 1,
    ...(isDev
      ? {}
      : {
          minimize: !process.env.NO_COMPRESS,
          sourceMap: !opts.disableCSSSourceMap,
        }),
  };

  function getCSSLoader(opts = {}) {
    const { cssModules, less, sass, sassOptions } = opts;

    let hasSassLoader = true;
    try {
      require.resolve('sass-loader');
    } catch (e) {
      hasSassLoader = false;
    }

    return [
      require.resolve('style-loader'),
      {
        loader: require.resolve('css-loader'),
        options: {
          ...cssOptions,
          ...(cssModules ? cssModulesConfig : {}),
        },
      },
      {
        loader: require.resolve('postcss-loader'),
        options: postcssOptions,
      },
      ...(less
        ? [
            {
              loader: require.resolve('less-loader'),
              options: lessOptions,
            },
          ]
        : []),
      ...(sass && hasSassLoader
        ? [
            {
              loader: require.resolve('sass-loader'),
              options: sassOptions,
            },
          ]
        : []),
    ];
  }

  const cssRules = [
    {
      test: /\.css$/,
      exclude: /node_modules/,
      use: getCSSLoader({
        cssModules: true,
      }),
    },
    {
      test: /\.css$/,
      include: /node_modules/,
      use: getCSSLoader(),
    },
    {
      test: /\.less$/,
      exclude: /node_modules/,
      use: getCSSLoader({
        cssModules: true,
        less: true,
      }),
    },
    {
      test: /\.less$/,
      include: /node_modules/,
      use: getCSSLoader({
        less: true,
      }),
    },
    {
      test: /\.(sass|scss)$/,
      exclude: /node_modules/,
      use: getCSSLoader({
        cssModules: true,
        sass: true,
        sassOptions: opts.sass,
      }),
    },
    {
      test: /\.(sass|scss)$/,
      include: /node_modules/,
      use: getCSSLoader({
        sass: true,
        sassOptions: opts.sass,
      }),
    },
  ];

  // 生成环境下用 ExtractTextPlugin 提取出来
  if (!isDev) {
    cssRules.forEach(rule => {
      rule.use = ExtractTextPlugin.extract({
        use: rule.use.slice(1),
      });
    });
  }

  // TODO: 根据 opts.hash 自动处理这里的 filename
  const commonsPlugins = (opts.commons || []).map(common => {
    return new webpack.optimize.CommonsChunkPlugin(common);
  });

  const copyPlugins = opts.copy ? [new CopyWebpackPlugin(opts.copy)] : [];

  // js 和 css 采用不同的 hash 算法
  const jsHash = opts.hash ? '.[chunkhash:8]' : '';
  const cssHash = opts.hash ? '.[contenthash:8]' : '';

  const babelUse = [
    {
      loader: require('path').join(__dirname, 'debugLoader.js'),
    },
    {
      loader: require.resolve('babel-loader'),
      options: {
        ...(opts.babel || babelConfig),
        // 性能提升有限，但会带来一系列答疑的工作量，所以不开放
        cacheDirectory: false,
        babelrc: process.env.DISABLE_BABELRC ? false : true,
      },
    },
  ];

  const eslintOptions = {
    formatter: eslintFormatter,
    baseConfig: {
      extends: [require.resolve('eslint-config-umi')],
    },
    ignore: false,
    eslintPath: require.resolve('eslint'),
    useEslintrc: false,
  };

  // 用用户的 eslint
  try {
    const { dependencies, devDependencies } = require(resolve('package.json')); // eslint-disable-line
    if (dependencies.eslint || devDependencies) {
      const eslintPath = resolveSync('eslint', {
        basedir: opts.cwd,
      });
      eslintOptions.eslintPath = eslintPath;
      debug(`use user's eslint bin: ${eslintPath}`);
    }
  } catch (e) {
    // do nothing
  }

  // 读用户的 eslintrc
  if (existsSync(resolve('.eslintrc'))) {
    try {
      const userRc = readRc(resolve('.eslintrc'));
      debug(`userRc: ${JSON.stringify(userRc)}`);
      if (userRc.extends) {
        debug(`use user's .eslintrc: ${resolve('.eslintrc')}`);
        eslintOptions.useEslintrc = true;
        eslintOptions.baseConfig = false;
        eslintOptions.ignore = true;
      } else {
        debug(`extend with user's .eslintrc: ${resolve('.eslintrc')}`);
        eslintOptions.baseConfig = {
          ...eslintOptions.baseConfig,
          ...userRc,
        };
      }
    } catch (e) {
      debug(e);
    }
  }

  const config = {
    bail: !isDev,
    devtool: opts.devtool || undefined,
    entry: opts.entry || null,
    output: {
      path: opts.outputPath || null,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isDev,
      filename: `[name]${jsHash}.js`,
      publicPath: opts.publicPath || undefined,
      chunkFilename: `[name]${jsHash}.async.js`,
    },
    resolve: {
      modules: [
        resolve(__dirname, '../node_modules'),
        'node_modules',
        ...(opts.extraResolveModules || []),
      ],
      extensions: [
        ...(opts.extraResolveExtensions || []),
        '.web.js',
        '.web.jsx',
        '.web.ts',
        '.web.tsx',
        '.js',
        '.json',
        '.jsx',
        '.ts',
        '.tsx',
      ],
      alias: {
        '@babel/runtime': dirname(require.resolve('@babel/runtime/package')),
        ...opts.alias,
      },
    },
    module: {
      rules: [
        ...(process.env.DISABLE_ESLINT
          ? []
          : [
              {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                enforce: 'pre',
                use: [
                  {
                    options: eslintOptions,
                    loader: require.resolve('eslint-loader'),
                  },
                ],
              },
            ]),
        {
          exclude: [
            /\.html$/,
            /\.json$/,
            /\.(js|jsx|ts|tsx)$/,
            /\.(css|less|scss|sass)$/,
          ],
          loader: require.resolve('url-loader'),
          options: {
            limit: 10000,
            name: 'static/[name].[hash:8].[ext]',
          },
        },
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: babelUse,
        },
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: [
            ...babelUse,
            {
              loader: require.resolve('awesome-typescript-loader'),
              options: {
                transpileOnly: true,
              },
            },
          ],
        },
        ...(opts.extraBabelIncludes
          ? opts.extraBabelIncludes.map(include => {
              return {
                test: /\.(js|jsx)$/,
                include: join(opts.cwd, include),
                use: babelUse,
              };
            })
          : []),
        {
          test: /\.html$/,
          loader: require.resolve('file-loader'),
          options: {
            name: '[name].[ext]',
          },
        },
        ...cssRules,
      ],
    },
    plugins: [
      ...(isDev
        ? [
            new webpack.HotModuleReplacementPlugin(),
            new WatchMissingNodeModulesPlugin(join(opts.cwd, 'node_modules')),
            new SystemBellWebpackPlugin(),
          ].concat(
            opts.devtool
              ? []
              : [
                  new webpack.SourceMapDevToolPlugin({
                    columns: false,
                    moduleFilenameTemplate: info => {
                      if (
                        /\/koi-pkgs\/packages/.test(
                          info.absoluteResourcePath,
                        ) ||
                        /packages\/koi-core/.test(info.absoluteResourcePath) ||
                        /webpack\/bootstrap/.test(info.absoluteResourcePath) ||
                        /\/node_modules\//.test(info.absoluteResourcePath)
                      ) {
                        return `internal:///${info.absoluteResourcePath}`;
                      }
                      return resolve(info.absoluteResourcePath).replace(
                        /\\/g,
                        '/',
                      );
                    },
                  }),
                ],
          )
        : [
            new webpack.optimize.OccurrenceOrderPlugin(),
            new webpack.optimize.ModuleConcatenationPlugin(),
            new ExtractTextPlugin({
              filename: `[name]${cssHash}.css`,
              allChunks: true,
            }),
          ]),
      ...(isDev || process.env.NO_COMPRESS
        ? []
        : [new webpack.optimize.UglifyJsPlugin(uglifyJSConfig)]),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(
          // eslint-disable-line
          isDev ? 'development' : 'production',
        ), // eslint-disable-line
        // 给 socket server 用
        ...(process.env.SOCKET_SERVER
          ? {
              'process.env.SOCKET_SERVER': JSON.stringify(
                process.env.SOCKET_SERVER,
              ),
            }
          : {}),
        ...stringifyObject(opts.define || {}),
      }),
      ...(process.env.ANALYZE
        ? [
            new BundleAnalyzerPlugin({
              analyzerMode: 'server',
              analyzerPort: process.env.ANALYZE_PORT || 8888,
              openAnalyzer: true,
            }),
          ]
        : []),
      new CaseSensitivePathsPlugin(),
      new webpack.LoaderOptionsPlugin({
        options: {
          context: __dirname,
        },
      }),
      ...(opts.ignoreMomentLocale
        ? [new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)]
        : []),
      ...commonsPlugins,
      ...copyPlugins,
    ],
    externals: opts.externals,
    node: {
      dgram: 'empty',
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
      child_process: 'empty',
    },
    performance: isDev
      ? {
          hints: false,
        }
      : {},
  };

  if (process.env.PUBLIC_PATH) {
    config.output.publicPath = process.env.PUBLIC_PATH;
  }

  return applyWebpackConfig(config);
}
