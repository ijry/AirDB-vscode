import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale'
import enLocale from 'element-ui/lib/locale/lang/en'
import zhLocale from 'element-ui/lib/locale/lang/zh-CN'
import VueRouter from 'vue-router'
import UmyTable from 'umy-table'
import { i18n } from './i18n/index' //国际化

import 'umy-table/lib/theme-chalk/index.css';
import '@/../public/theme/auto.css'
import '@/../public/theme/umyui.css'
import "tailwindcss/tailwind.css"

// 设置语言
if (i18n.locale == 'zh') {
  locale.use(zhLocale)
} else {
  locale.use(enLocale)
}

Vue.use(VueRouter)
Vue.use(ElementUI, { locale });
Vue.use(UmyTable);

Vue.config.productionTip = false

import connect from "./connect";
import status from "./status";
import design from "./design";
import structDiff from "./structDiff";
import keyView from "./redis/keyView";
import terminal from "./redis/terminal";
import redisStatus from "./redis/redisStatus";
import forward from "./forward";
import sshTerminal from "./xterm";

const router = new VueRouter({
  routes: [
    { path: '/connect', component: connect, name: 'connect' },
    { path: '/status', component: status, name: 'status' },
    { path: '/design', component: design, name: 'design' },
    { path: '/structDiff', component: structDiff, name: 'structDiff' },
    // redis
    { path: '/keyView', component: keyView, name: 'keyView' },
    { path: '/terminal', component: terminal, name: 'terminal' },
    { path: '/redisStatus', component: redisStatus, name: 'redisStatus' },
    // ssh
    { path: '/forward', component: forward, name: 'forward' },
    { path: '/sshTerminal', component: sshTerminal, name: 'sshTerminal' },
  ]
})

new Vue({
  el: '#app',
  components: { App },
  router,
  i18n, //使用国际化
  template: '<App/>'
})
