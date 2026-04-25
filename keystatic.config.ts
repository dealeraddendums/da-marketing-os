import { config, collection, fields } from '@keystatic/core'

export default config({
  storage: { kind: 'local' },
  collections: {
    posts: collection({
      label: 'Blog Posts',
      slugField: 'title',
      path: 'content/posts/*',
      format: { contentField: 'content' },
      schema: {
        title:          fields.slug({ name: { label: 'Title' } }),
        publishedAt:    fields.date({ label: 'Published Date' }),
        status:         fields.select({
          label: 'Status',
          options: [
            { label: 'Draft',     value: 'draft'     },
            { label: 'Scheduled', value: 'scheduled' },
            { label: 'Published', value: 'published' },
          ],
          defaultValue: 'draft',
        }),
        seoTitle:       fields.text({ label: 'SEO Title', validation: { isRequired: false } }),
        seoDescription: fields.text({ label: 'Meta Description', multiline: true }),
        aiGenerated:    fields.checkbox({ label: 'AI Generated', defaultValue: false }),
        content:        fields.mdx({ label: 'Content' }),
      },
    }),

    landingPages: collection({
      label: 'Landing Pages',
      slugField: 'slug',
      path: 'content/lp/*',
      format: { contentField: 'content' },
      schema: {
        slug:        fields.slug({ name: { label: 'Slug' } }),
        variant:     fields.text({ label: 'Variant (a or b)' }),
        headline:    fields.text({ label: 'Headline' }),
        subheadline: fields.text({ label: 'Subheadline', multiline: true }),
        ctaText:     fields.text({ label: 'CTA Text' }),
        content:     fields.mdx({ label: 'Content' }),
      },
    }),

    socialPosts: collection({
      label: 'Social Queue',
      slugField: 'scheduledFor',
      path: 'content/social/*',
      format: { data: 'json' },
      schema: {
        scheduledFor: fields.slug({ name: { label: 'Scheduled For' } }),
        platform:     fields.select({
          label: 'Platform',
          options: [
            { label: 'LinkedIn', value: 'linkedin' },
            { label: 'Twitter/X', value: 'twitter' },
            { label: 'Facebook', value: 'facebook' },
          ],
          defaultValue: 'linkedin',
        }),
        content:      fields.text({ label: 'Post Content', multiline: true }),
        status:       fields.select({
          label: 'Status',
          options: [
            { label: 'Draft',     value: 'draft'     },
            { label: 'Scheduled', value: 'scheduled' },
            { label: 'Published', value: 'published' },
          ],
          defaultValue: 'draft',
        }),
        aiGenerated: fields.checkbox({ label: 'AI Generated', defaultValue: false }),
      },
    }),
  },
})
