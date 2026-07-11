import { createApp } from 'vue';
import App from './App';
import Contextmenu from './component/Contextmenu';
import { i18n } from './i18n/index';
import { installUi } from '../bootstrap/installUi';

import '@/../public/theme/auto.css';
import '@/../public/theme/umyui.css';
import './view.css';
import './icon/iconfont.css';

const app = createApp(App);
installUi(app, { locale: i18n.global.locale });
app.use(Contextmenu);
app.use(i18n);
app.mount('#app');
