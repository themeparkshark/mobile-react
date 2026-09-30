// Removes console.log/info/debug/warn/trace calls from release bundles.
// console.error is kept so real failures still reach device logs and the
// crash reporter. Zero dependencies: this replaces
// babel-plugin-transform-remove-console without adding a package.
const STRIPPED = new Set(['log', 'info', 'debug', 'warn', 'trace', 'table', 'group', 'groupEnd', 'time', 'timeEnd']);

module.exports = function stripConsole({ types: t }) {
  return {
    name: 'tps-strip-console',
    visitor: {
      CallExpression(path) {
        const callee = path.get('callee');
        if (!callee.isMemberExpression()) return;
        const object = callee.get('object');
        if (!object.isIdentifier({ name: 'console' })) return;
        if (path.scope.hasBinding('console')) return;
        const property = callee.node.property;
        const name = callee.node.computed
          ? (t.isStringLiteral(property) ? property.value : null)
          : (t.isIdentifier(property) ? property.name : null);
        if (!name || !STRIPPED.has(name)) return;
        if (path.parentPath.isExpressionStatement()) {
          path.parentPath.remove();
        } else {
          path.replaceWith(t.unaryExpression('void', t.numericLiteral(0)));
        }
      },
    },
  };
};
