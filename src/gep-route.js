'use strict';
function acceptsGep(context, showConfig) {
  const expectedCode = (showConfig?.matchCode || 'MAIN').toUpperCase();
  const code = (context?.matchCode || 'MAIN').toUpperCase();
  return code === expectedCode && (!showConfig?.showId || context?.showId === showConfig.showId);
}
module.exports = { acceptsGep };
