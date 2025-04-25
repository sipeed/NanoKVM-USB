const languages = [
  { key: 'en', name: 'English' },
  { key: 'ru', name: 'Русский' },
  { key: 'zh', name: '中文' },
  { key: 'de', name: 'Deutsch' },
  { key: 'nl', name: 'Nederlands' },
  { key: 'be', name: 'België' }
]

languages.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))

export default languages
