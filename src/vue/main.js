import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App';
import { i18n } from './i18n/index';
import { installUi } from './bootstrap/installUi';

import '@/../public/theme/auto.css';
import '@/../public/theme/umyui.css';
import 'tailwindcss/tailwind.css';

import connect from './connect';
import status from './status';
import design from './design';
import structDiff from './structDiff';
import keyView from './redis/keyView';
import terminal from './redis/terminal';
import redisStatus from './redis/redisStatus';
import kafkaMessageViewer from './kafka/messageViewer.vue';
import kafkaMessageProducer from './kafka/messageProducer.vue';
import rabbitmqMessageViewer from './rabbitmq/messageViewer.vue';
import rabbitmqMessageProducer from './rabbitmq/messageProducer.vue';
import forward from './forward';
import sshTerminal from './xterm';
import userCenter from './user/userCenter.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/connect', component: connect, name: 'connect' },
    { path: '/status', component: status, name: 'status' },
    { path: '/design', component: design, name: 'design' },
    { path: '/structDiff', component: structDiff, name: 'structDiff' },
    { path: '/keyView', component: keyView, name: 'keyView' },
    { path: '/terminal', component: terminal, name: 'terminal' },
    { path: '/redisStatus', component: redisStatus, name: 'redisStatus' },
    { path: '/kafkaMessageViewer', component: kafkaMessageViewer, name: 'kafkaMessageViewer' },
    { path: '/kafkaMessageProducer', component: kafkaMessageProducer, name: 'kafkaMessageProducer' },
    { path: '/rabbitmqMessageViewer', component: rabbitmqMessageViewer, name: 'rabbitmqMessageViewer' },
    { path: '/rabbitmqMessageProducer', component: rabbitmqMessageProducer, name: 'rabbitmqMessageProducer' },
    { path: '/forward', component: forward, name: 'forward' },
    { path: '/sshTerminal', component: sshTerminal, name: 'sshTerminal' },
    { path: '/userCenter', component: userCenter, name: 'userCenter' }
  ]
});

const app = createApp(App);
installUi(app, { locale: i18n.global.locale });
app.use(router);
app.use(i18n);
app.mount('#app');
