import { createI18n } from 'vue-i18n';

const locale = 'en';

export const i18n = createI18n({
  legacy: true,
  globalInjection: true,
  locale,
  messages: {
    zh: require('./lang/zh').default,
    en: require('./lang/en').default
  }
});

export default i18n;
