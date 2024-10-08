import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
Vue.use(ElementUI, { locale });
import Contextmenu from "./component/Contextmenu"
Vue.use(Contextmenu);
import { i18n } from './i18n/index' //国际化
import UmyTable from 'umy-table'
import 'umy-table/lib/theme-chalk/index.css';
import '@/../public/theme/auto.css'
import '@/../public/theme/umyui.css'
import './view.css'
import './icon/iconfont.css'
Vue.use(UmyTable);

Vue.config.productionTip = false

new Vue({
  el: '#app',
  components: { App },
  i18n, // 使用国际化
  template: '<App/>'
})
