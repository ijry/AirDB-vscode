import ElementPlus, { ElLoading, ElMessage, ElMessageBox } from 'element-plus';
import en from 'element-plus/es/locale/lang/en';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import VXETable, { setIcon } from 'vxe-table';

import 'element-plus/dist/index.css';
import 'vxe-table/lib/style.css';

// Prefer CSS triangle caret icons over iconfont glyphs in webview.
setIcon({
  TABLE_SORT_ASC: 'vxe-icon--caret-top',
  TABLE_SORT_DESC: 'vxe-icon--caret-bottom',
});

function resolveElementLocale(locale) {
  return locale === 'zh' || locale === 'zh-CN' ? zhCn : en;
}

export function installUi(app, options = {}) {
  const locale = resolveElementLocale(options.locale);
  app.use(ElementPlus, { locale });
  app.use(VXETable);

  Object.entries(ElementPlusIconsVue).forEach(([name, component]) => {
    app.component(name, component);
  });

  app.config.globalProperties.$message = ElMessage;
  app.config.globalProperties.$msgbox = ElMessageBox;
  app.config.globalProperties.$alert = ElMessageBox.alert;
  app.config.globalProperties.$confirm = ElMessageBox.confirm;
  app.config.globalProperties.$prompt = ElMessageBox.prompt;
  app.config.globalProperties.$loading = ElLoading.service;
}
