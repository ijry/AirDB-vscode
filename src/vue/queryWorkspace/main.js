import { createApp } from 'vue';
import App from './App';
import { installUi } from '../bootstrap/installUi';

import '@/../public/theme/auto.css';
import '@/../public/theme/umyui.css';
import '../result/view.css';
import '../result/icon/iconfont.css';

const app = createApp(App);
installUi(app, { locale: 'en' });
app.mount('#app');
