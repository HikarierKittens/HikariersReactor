import { createApp } from 'vue';
import App from './vue/App.vue';
import { createGameStore } from './app/store';
import type { GameStore } from './app/store';

/** Browser entry: the runtime owns the simulation, Vue only renders it. */
export function mountGame(root: Element): { app: ReturnType<typeof createApp>; store: GameStore } {
  const store = createGameStore();
  store.runtime.load();
  const app = createApp(App, { store });
  app.mount(root);
  return { app, store };
}

const root = document.getElementById('app');
// Importing this module must not double-mount when a harness already mounted it.
if (root && root.getAttribute('data-v-app') === null && !root.childElementCount) mountGame(root);
