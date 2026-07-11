import { createApp } from 'vue';
import App from './App';
import Contextmenu from './component/Contextmenu';
import { i18n } from './i18n/index';
import { installUi } from '../bootstrap/installUi';

import '@/../public/theme/auto.css';
import './view.css';
import './icon/iconfont.css';

const app = createApp(App);
const locale = typeof i18n.global.locale === 'string' ? i18n.global.locale : i18n.global.locale.value;
installUi(app, { locale });
app.use(Contextmenu);
app.use(i18n);
app.mount('#app');
