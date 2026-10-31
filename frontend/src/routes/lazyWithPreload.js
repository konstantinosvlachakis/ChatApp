import React from "react";

/**
 * React.lazy with a `preload()` that can run before the first render.
 *
 * Once the module has loaded, the lazy factory returns a *synchronous* thenable, so
 * React resolves the component during render instead of suspending. That lets
 * `src/index.js` preload the current route's chunk, then render the final page in the
 * first commit (no Suspense fallback replacing the prerendered markup).
 */
export function lazyWithPreload(factory) {
  let loadedModule = null;
  let pending = null;

  const preload = () => {
    if (loadedModule) return Promise.resolve(loadedModule);
    if (!pending) {
      pending = factory().then(
        (module) => {
          loadedModule = module;
          return module;
        },
        (error) => {
          pending = null; // let a later render retry (chunk load after a deploy, offline…)
          throw error;
        }
      );
    }
    return pending;
  };

  const Component = React.lazy(() => {
    if (loadedModule) {
      const module = loadedModule;
      return { then: (resolve) => resolve(module) };
    }
    return preload();
  });
  Component.preload = preload;
  return Component;
}
