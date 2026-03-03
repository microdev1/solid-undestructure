import { ESLint } from 'eslint'
import { processor } from './modules/processor'

const configs: ESLint.Plugin['configs'] = {}

const plugin: ESLint.Plugin = {
  meta: {
    name: 'eslint-plugin-solid-undestructure'
  },
  processors: {
    'solid-undestructure': processor
  },
  configs
}

Object.assign(configs, {
  'flat/recommended': {
    plugins: {
      'solid-undestructure': plugin
    },
    processor: 'solid-undestructure/solid-undestructure'
  }
})

export default plugin
