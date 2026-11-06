/**
 * Makes Express 4 safe for `async` route handlers.
 *
 * Express 4 does not catch a rejected promise from an `async (req, res) => {}` handler. Node then treats it as an
 * unhandled rejection and the WHOLE backend exits, so every page fails with "Request failed (500)" until someone
 * restarts it (and `tsx watch` does not restart a process that crashed on its own).
 *
 * This forwards a handler's rejection to Express' error handler instead, so one bad request returns a 500 for that
 * request only and the server keeps running. Import it once, before any router is created.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Layer: any = require('express/lib/router/layer');

if (!Layer.prototype.__asyncSafe) {
  Object.defineProperty(Layer.prototype, '__asyncSafe', { value: true });
  const descriptor = Object.getOwnPropertyDescriptor(Layer.prototype, 'handle');
  // Express stores the user's function on layer.handle (an own property set in the constructor), so wrap it there.
  const origHandleRequest = Layer.prototype.handle_request;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Layer.prototype.handle_request = function (req: any, res: any, next: any) {
    const fn = this.handle;
    if (typeof fn !== 'function' || fn.length > 3) return origHandleRequest.call(this, req, res, next);
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
  void descriptor;
}
