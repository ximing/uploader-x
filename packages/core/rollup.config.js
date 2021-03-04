const path = require('path');
const webWorkerLoader = require('rollup-plugin-web-worker-loader');
const resolvePlugin = require('@rollup/plugin-node-resolve');
const typescript = require('rollup-plugin-typescript2');
const externalsPlugin = require('rollup-plugin-auto-external');

const workerConf = {
  targetPlatform: 'browser',
  inline: false,
};
// this is also used in watch mode by the startExample script
const defaultBuild = [
  {
    input: path.resolve('src/index.ts'),
    external: [],
    plugins: [
      webWorkerLoader(workerConf),
      resolvePlugin(),
      typescript({
        tsconfig: 'tsconfig.build.json',
        clean: true,
      }),
      externalsPlugin({ dependencies: true, peerDependecies: true }),
    ],
    output: {
      format: 'es',
      dir: 'dist',
      entryFileNames: 'es.es6.js',
      sourcemap: true,
    },
  },
];

const allBuilds = [
  ...defaultBuild,
  {
    input: path.resolve('src/index.ts'),
    external: [],
    plugins: [
      webWorkerLoader(workerConf),
      resolvePlugin(),
      typescript({
        tsconfig: 'tsconfig.build.json',
        clean: true,
      }),
      externalsPlugin({ dependencies: true, peerDependecies: true }),
    ],
    output: {
      format: 'es',
      dir: 'dist',
      entryFileNames: 'es.es5.js',
      sourcemap: true,
    },
  },
  {
    input: path.resolve('src/index.ts'),
    external: [],
    plugins: [
      webWorkerLoader(workerConf),
      resolvePlugin(),
      typescript({
        tsconfig: 'tsconfig.build.json',
        clean: true,
      }),
      externalsPlugin({ dependencies: true, peerDependecies: true }),
    ],
    output: {
      format: 'cjs',
      dir: 'dist',
      entryFileNames: 'cjs.es6.js',
      sourcemap: true,
    },
  },
  {
    input: path.resolve('src/index.ts'),
    external: [],
    plugins: [
      webWorkerLoader(workerConf),
      resolvePlugin(),
      typescript({
        tsconfig: 'tsconfig.build.json',
        clean: true,
      }),
      externalsPlugin({ dependencies: true, peerDependecies: true }),
    ],
    output: {
      format: 'cjs',
      dir: 'dist',
      entryFileNames: 'cjs.es5.js',
      sourcemap: true,
    },
  },
];

export default allBuilds;
