import { createApp } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import App from './App.vue';
import { registerElementPlus } from './element-plus';
import { queryClient } from './queryClient';
import router from './router';
import './styles.css';

const app = createApp(App);

app.use(router);
app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
registerElementPlus(app);
app.mount('#app');
