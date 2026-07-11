import { createI18n } from 'vue-i18n';

const locale = 'en';

export const i18n = createI18n({
  legacy: true,
  globalInjection: true,
  locale,
  messages: {
    zh: require('./lang/zh').default,
    en: require('./lang/en').default,
    ar: require('./lang/ar').default,
    fr: require('./lang/fr').default,
    ja: require('./lang/ja').default,
    ko: require('./lang/ko').default,
    ru: require('./lang/ru').default
  }
});

export default i18n;
