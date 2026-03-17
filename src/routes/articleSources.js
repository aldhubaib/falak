const express = require('express')
const db = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')
const {
  VALID_SOURCE_TYPES,
  GNEWS_CATEGORIES,
  NYT_SECTIONS,
  validateConfig,
  testSourceFetch,
} = require('../services/articlePipeline')

const router = express.Router()
router.use(requireAuth)

// ── GET /api/article-sources?projectId=X ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId required' })

    const sources = await db.articleSource.findMany({
      where: { projectId },
      include: {
        _count: { select: { articles: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const withStats = await Promise.all(sources.map(async (s) => {
      const stageCounts = await db.article.groupBy({
        by: ['stage'],
        where: { sourceId: s.id },
        _count: true,
      })
      const stats = {}
      for (const row of stageCounts) {
        stats[row.stage] = row._count
      }
      return { ...s, articleCount: s._count.articles, stats }
    }))

    res.json(withStats)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-sources ─────────────────────────────────────────────
router.post('/', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId, type, label, config, language } = req.body
    if (!projectId || !type || !label || !config) {
      return res.status(400).json({ error: 'projectId, type, label, and config are required' })
    }
    if (!VALID_SOURCE_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}` })
    }
    const configError = validateConfig(type, config)
    if (configError) return res.status(400).json({ error: configError })

    const source = await db.articleSource.create({
      data: {
        projectId,
        type,
        label: label.trim(),
        config,
        language: language || 'en',
      },
    })
    res.json(source)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PATCH /api/article-sources/:id ────────────────────────────────────────
router.patch('/:id', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const existing = await db.articleSource.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Source not found' })

    const data = {}
    if (req.body.label !== undefined) data.label = req.body.label.trim()
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive
    if (req.body.language !== undefined) data.language = req.body.language
    if (req.body.config !== undefined) {
      const type = req.body.type || existing.type
      const configError = validateConfig(type, req.body.config)
      if (configError) return res.status(400).json({ error: configError })
      data.config = req.body.config
      if (req.body.type) data.type = req.body.type
    }

    const updated = await db.articleSource.update({ where: { id: req.params.id }, data })
    res.json(updated)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/article-sources/:id ───────────────────────────────────────
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await db.articleSource.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Source not found' })
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/article-sources/:id/test — dry-run fetch ────────────────────
router.post('/:id/test', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const source = await db.articleSource.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    })
    if (!source) return res.status(404).json({ error: 'Source not found' })

    const articles = await testSourceFetch(source.type, source.config, source.project)
    res.json({ articles, count: articles.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/article-sources/field-schema — API-specific SEARCH fields ────
router.get('/field-schema', async (req, res) => {
  const schema = {
    newsapi: {
      label: 'NewsAPI',
      docs: 'https://newsapi.org/docs/endpoints/everything',
      fields: [
        { key: 'q', label: 'Query', type: 'text', required: true, placeholder: 'e.g. bitcoin OR crypto', help: 'Advanced search: surround phrases with "", use AND/OR/NOT, +/- prefix. Max 500 chars.' },
        { key: 'searchIn', label: 'Search in', type: 'select', options: ['title', 'description', 'content', 'title,description', 'title,content'], help: 'Fields to search. Default: all.' },
        { key: 'sortBy', label: 'Sort by', type: 'select', options: ['relevancy', 'publishedAt', 'popularity'], help: 'Default: relevancy.' },
        { key: 'pageSize', label: 'Page size', type: 'number', min: 1, max: 100, help: '1–100. Default: 20.' },
        { key: 'from', label: 'From date', type: 'date', help: 'Oldest article. Format: YYYY-MM-DD. Free plan: last month only.' },
        { key: 'to', label: 'To date', type: 'date', help: 'Newest article. Format: YYYY-MM-DD.' },
        { key: 'domains', label: 'Domains', type: 'text', placeholder: 'bbc.co.uk,techcrunch.com', help: 'Comma-separated. Restrict to specific domains.' },
        { key: 'excludeDomains', label: 'Exclude domains', type: 'text', placeholder: 'example.com', help: 'Comma-separated domains to exclude.' },
      ],
    },
    gnews: {
      label: 'GNews Search',
      docs: 'https://gnews.io/docs/v4#search-endpoint',
      fields: [
        { key: 'q', label: 'Query', type: 'text', required: true, placeholder: 'e.g. artificial intelligence', help: 'Use AND, OR, NOT operators. Use "-" to exclude. Wrap phrases in "". Max 200 chars.' },
        { key: 'sortby', label: 'Sort by', type: 'select', options: ['relevance', 'publishedAt'], help: 'Default: relevance.' },
        { key: 'max', label: 'Max results', type: 'number', min: 1, max: 100, help: '1–100. Default: 10.' },
        { key: 'from', label: 'From date', type: 'date', help: 'Oldest article. Format: YYYY-MM-DD.' },
        { key: 'to', label: 'To date', type: 'date', help: 'Newest article. Format: YYYY-MM-DD.' },
        { key: 'in', label: 'Search in', type: 'select', options: ['title', 'description', 'content', 'title,description'], help: 'Where to search. Default: title,description.' },
        { key: 'nullable', label: 'Allow null fields', type: 'text', placeholder: 'description,content', help: 'Comma-separated. Allow null in these fields.' },
      ],
    },
    gnews_top: {
      label: 'GNews Top Headlines',
      docs: 'https://gnews.io/docs/v4#top-headlines-endpoint',
      fields: [
        { key: 'category', label: 'Category', type: 'select', required: true, options: GNEWS_CATEGORIES, help: 'Required. Topic category for top headlines.' },
        { key: 'max', label: 'Max results', type: 'number', min: 1, max: 100, help: '1–100. Default: 10.' },
        { key: 'q', label: 'Query filter', type: 'text', placeholder: 'optional keyword filter', help: 'Optional keyword to narrow within category.' },
      ],
    },
    guardian: {
      label: 'The Guardian',
      docs: 'https://open-platform.theguardian.com/documentation/',
      fields: [
        { key: 'q', label: 'Query', type: 'text', required: true, placeholder: 'e.g. climate change', help: 'Free-text query. AND/OR/NOT supported.' },
        { key: 'section', label: 'Section', type: 'text', placeholder: 'e.g. technology, world, business', help: 'Comma-separated section IDs to filter by.' },
        { key: 'tag', label: 'Tags', type: 'text', placeholder: 'e.g. tone/news', help: 'Comma-separated tag IDs.' },
        { key: 'pageSize', label: 'Page size', type: 'number', min: 1, max: 200, help: '1–200. Default: 15.' },
        { key: 'from-date', label: 'From date', type: 'date', help: 'Oldest article. Format: YYYY-MM-DD.' },
        { key: 'to-date', label: 'To date', type: 'date', help: 'Newest article. Format: YYYY-MM-DD.' },
        { key: 'order-by', label: 'Order by', type: 'select', options: ['newest', 'oldest', 'relevance'], help: 'Default: relevance.' },
      ],
    },
    nyt_search: {
      label: 'NYT Article Search',
      docs: 'https://developer.nytimes.com/docs/articlesearch-product/1/overview',
      fields: [
        { key: 'q', label: 'Query', type: 'text', required: true, placeholder: 'e.g. climate policy', help: 'Free-text search query.' },
        { key: 'fq', label: 'Filter query (fq)', type: 'text', placeholder: 'e.g. section_name:("Business")', help: 'Lucene syntax. Filter by section, type, source, etc. See NYT docs.' },
        { key: 'begin_date', label: 'Begin date', type: 'date', help: 'Format: YYYYMMDD' },
        { key: 'end_date', label: 'End date', type: 'date', help: 'Format: YYYYMMDD' },
        { key: 'sort', label: 'Sort', type: 'select', options: ['newest', 'oldest', 'relevance'], help: 'Default: relevance.' },
      ],
    },
    nyt_top: {
      label: 'NYT Top Stories',
      docs: 'https://developer.nytimes.com/docs/top-stories-product/1/overview',
      fields: [
        { key: 'section', label: 'Section', type: 'select', required: true, options: NYT_SECTIONS, help: 'Required. The section to fetch top stories from.' },
      ],
    },
    rss: {
      label: 'RSS Feed',
      docs: null,
      fields: [
        { key: 'url', label: 'Feed URL', type: 'url', required: true, placeholder: 'https://example.com/feed.xml', help: 'Full URL to the RSS/Atom feed.' },
      ],
    },
    apify_actor: {
      label: 'Apify Actor',
      docs: 'https://docs.apify.com/',
      fields: [],
    },
  }
  res.json(schema)
})

// ── POST /api/article-sources/test-config — dry-run with arbitrary config ─
router.post('/test-config', requireRole('owner', 'admin', 'editor'), async (req, res) => {
  try {
    const { projectId, type, config } = req.body
    if (!projectId || !type || !config) {
      return res.status(400).json({ error: 'projectId, type, and config required' })
    }
    const configError = validateConfig(type, config)
    if (configError) return res.status(400).json({ error: configError })

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const articles = await testSourceFetch(type, config, project)
    res.json({ articles, count: articles.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
