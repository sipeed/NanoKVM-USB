const languages = [
  { key: 'en', name: 'English' },
  { key: 'ru', name: 'Русский' },
  { key: 'zh', name: '简体中文' },
  { key: 'zh_tw', name: '繁體中文' },
  { key: 'de', name: 'Deutsch' },
  { key: 'nl', name: 'Nederlands' },
  { key: 'be', name: 'België' },
  { key: 'ko', name: '한국어' },
  { key: 'pt_br', name: 'Português (Brasil)' },
  { key: 'pl', name: 'Polski' }
];

languages.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

export default languages;
