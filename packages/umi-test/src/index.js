import jestCli from 'jest-cli';
import { join } from 'path';
import { existsSync, statSync } from 'fs';

const debug = require('debug')('umi-test');

function test(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

export default function(opts = {}) {
  const { watch, coverage, libraryName = 'umi', cwd = process.cwd() } = opts;

  let pagesPath = 'pages';
  if (test(join(cwd, 'src/page'))) {
    pagesPath = 'src/page';
  }
  if (test(join(cwd, 'src/pages'))) {
    pagesPath = 'src/pages';
  }

  const config = {
    rootDir: process.cwd(),
    transform: {
      '\\.js$': require.resolve('./transformers/jsTransformer'),
      '\\.tsx?$': require.resolve('./transformers/tsTransformer'),
    },
    testMatch: ['**/?(*.)(spec|test|e2e).(j|t)s?(x)'],
    moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
    setupTestFrameworkScriptFile: require.resolve('./jasmine'),
    moduleNameMapper: {
      '\\.(css|less)$': require.resolve('./styleMock'),
    },
    ...(coverage
      ? {
          collectCoverageFrom: [
            'pages/**/*.{ts,tsx,js,jsx}',
            'src/pages/**/*.{ts,tsx,js,jsx}',
            'src/page/**/*.{ts,tsx,js,jsx}',
          ],
          collectCoverage: true,
          coveragePathIgnorePatterns: [
            `/${pagesPath}/.${libraryName}/`,
            `/${pagesPath}/.${libraryName}-production/`,
          ],
        }
      : {}),
  };

  return new Promise((resolve, reject) => {
    jestCli
      .runCLI(
        {
          watch,
          config: JSON.stringify(config),
        },
        [cwd],
      )
      .then(result => {
        debug(result);
        const { results } = result;
        // const success = results.every(result => result.success);
        results.success ? resolve() : reject('jest failed');
      })
      .catch(e => {
        console.log(e);
      });
  });
}
