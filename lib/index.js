const bodyParser = require('body-parser');
const normalize = require('path').normalize;
const spawn = require('child_process').spawn;
const express = require('express');
const fs = require('fs');

module.exports = function(ref, path, start, action) {
  // Create express instance
  const hookshot = express();

  // Middleware
  hookshot.use(bodyParser.urlencoded({ extended: false }));
  hookshot.use(bodyParser.json());

  // Main POST handler
  hookshot.post(path, function(req, res, next) {
    let payload = req.body;

    if (typeof payload.payload != 'undefined') {
      payload = JSON.parse(payload.payload);
    }

    if (typeof payload.ref != 'string') {
      throw new Error('Invalid ref');
    }

    if (payload.created) {
      hookshot.emit('create', payload);
    } else if (payload.deleted) {
      hookshot.emit('delete', payload);
    } else {
      hookshot.emit('push', payload);
    }

    hookshot.emit('hook', payload);
    hookshot.emit(payload.ref, payload);
    res.sendStatus(202);
  });

  if (arguments.length == 1) {
    action = ref;
    ref = 'hook';
  }

  if (typeof action == 'string') {
    let shell = process.env.SHELL;
    let args = ['-c', action];
    const opts = { stdio: 'inherit' };

    if (shell && isCygwin()) {
      shell = cygpath(shell);
    } else if (isWin()) {
      shell = process.env.ComSpec;
      args = ['/s', '/c', '"' + action + '"'];
      opts.windowsVerbatimArguments = true;
    }

    const doAction = () => runShellCommand(shell, args, opts);
    hookshot.on(ref, doAction);

    if (start) {
      doAction();
    }
  } else if (typeof action == 'function') {
    hookshot.on(ref, action);

    if (start) {
      action();
    }
  }

  return hookshot;
};

/**
 * Runs shell command
 *
 * @param  {string} shell
 * @param  {string} args
 * @param  {Object} opts
 */
function runShellCommand(shell, args, opts) {
  spawn(shell, args, opts);
}

/**
 * Returns `true` if node is currently running on Windows, `false` otherwise.
 *
 * @return {boolean}
 * @api private
 */

function isWin() {
  return 'win32' == process.platform;
}

/**
 * Returns `true` if node is currently running from within a "cygwin" environment.
 * Returns `false` otherwise.
 *
 * @return {boolean}
 * @api private
 */

function isCygwin() {
  // TODO: implement a more reliable check here...
  return isWin() && /cygwin/i.test(process.env.HOME);
}

/**
 * Convert a Unix-style Cygwin path (i.e. "/bin/bash") to a Windows-style path
 * (i.e. "C:\cygwin\bin\bash").
 *
 * @param {string} shellPath
 * @return {string}
 * @api private
 */

function cygpath(shellPath) {
  const cygwinPaths = ['C:\\cygwin', 'C:\\cygwin64'];
  let foundPath;

  for (let pathToTest of cygwinPaths) {
    const fullPath = normalize(pathToTest + shellPath + '.exe');

    if (fs.existsSync(fullPath)) {
      foundPath = fullPath;
      break;
    }
  }

  if (!foundPath) {
    console.log('Could not find Cygwin directory');
    return process.exit(1);
  }

  return foundPath;
}
