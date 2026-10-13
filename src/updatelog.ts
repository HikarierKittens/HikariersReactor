import { createApp } from 'vue';
import UpdateLogPanel from './vue/components/UpdateLogPanel.vue';

/** Standalone 更新日志 page entry (updatelog.html), opened in a new browser tab from the version bar. */
const root = document.getElementById('updatelog');
if (root) createApp(UpdateLogPanel).mount(root);
