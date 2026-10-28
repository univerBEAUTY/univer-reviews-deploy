import { describe, it, expect } from 'vitest'
import Ajv from 'ajv'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

// Cross-stack contract: this file pairs with apps/api/spec/contracts/
// widget_config_schema_spec.rb. Both sides load the SAME schema and
// validate a payload. If Rails adds a key the schema doesn't list, the
// Rails spec fails. If TS produces a payload that doesn't match the
// schema, this spec fails. Either side renaming a key without updating
// the schema breaks both specs in the same CI run.

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(here, '../../../packages/shared/widget-config.schema.json')

interface WidgetConfig {
  layout: 'default' | 'compact' | 'grid' | 'carousel' | 'showcase'
  locale: 'pt-BR' | 'en-US' | 'es-AR'
  theme_color: string
  star_color: string
  star_shape: 'star' | 'heart' | 'flame' | 'thumb' | 'diamond'
  star_icon_url?: string | null
  star_icon_empty_url?: string | null
  show_qa: boolean
  show_write_review: boolean
  per_page: number
  custom_css: string
}

const sample: WidgetConfig = {
  layout: 'default',
  locale: 'pt-BR',
  theme_color: '#d4a850',
  star_color: '#fbbf24',
  star_shape: 'star',
  star_icon_url: null,
  star_icon_empty_url: null,
  show_qa: true,
  show_write_review: true,
  per_page: 10,
  custom_css: '',
}

describe('widget-config contract', () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'))
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)

  it('the canonical schema file is present + parseable', () => {
    expect(schema.$id).toBe('https://univerreviews.com/schemas/widget-config.json')
    expect(typeof validate).toBe('function')
  })

  it('a TS-side sample built from the WidgetConfig interface validates', () => {
    const ok = validate(sample)
    if (!ok) {
      throw new Error(
        `widget-config sample failed schema validation: ${JSON.stringify(validate.errors, null, 2)}`,
      )
    }
    expect(ok).toBe(true)
  })

  it('a sample with a custom star icon URL validates', () => {
    const withIcon = { ...sample, star_icon_url: 'https://cdn.example.com/test-bucket/foo.svg' }
    expect(validate(withIcon)).toBe(true)
  })

  it('omitting a required key fails the schema (sanity check)', () => {
    const broken = { ...sample } as Record<string, unknown>
    delete broken.layout
    expect(validate(broken)).toBe(false)
  })

  it('a bad enum value fails the schema (sanity check)', () => {
    const broken = { ...sample, layout: 'nonsense-layout' as unknown as 'default' }
    expect(validate(broken)).toBe(false)
  })
})
