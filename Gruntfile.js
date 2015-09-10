'use strict';

module.exports = function(grunt) {

  grunt.loadNpmTasks('grunt-eslint');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-version-check');

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    eslint: {
      main: {
        src: ['*.js','lib/**/*.js']
      },
      test: {
        src: ['test/**/*.js'],
      }
    },
    mochaTest: {
      options: {
      },
      any: {
        src: ['test/*.js']
      }
    },
    clean: {
      modules: ['node_modules'],
      build:   ['npm-debug.log'],
      editor:  ['./**/*~', './**/*.swp'],
      dist:    ['<%= clean.editor %>',
                '<%= clean.modules %>',
                '<%= clean.build %>',
                ],
    },
    versioncheck: {
      options: {
        skip : ['semver', 'npm', 'lodash'],
        hideUpToDate : false
      }
    },
  });

  grunt.registerTask('lint',    ['eslint']);
  grunt.registerTask('test',    ['mochaTest']);
  grunt.registerTask('version', ['versioncheck']);
  grunt.registerTask('default', ['eslint','mochaTest']);
};
