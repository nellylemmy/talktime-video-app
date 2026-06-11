import express from 'express';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { redisClient } from '../../../config/cache.js';

/**
 * Newsletter routes — serves the latest campaigns shown in the homepage carousel.
 *
 * Source of truth is the WordPress page maintained at adeafoundation.org/newsletter/
 * (read via the WP REST API). We extract the Mailchimp campaign links newest-first
 * and return the latest 9. No Mailchimp API, no database, no rotation logic:
 * "keep 9, drop oldest" is just slice(0, 9) of the live source on each refresh.
 */

const router = express.Router();

const WP_URL = 'https://adeafoundation.org/wp-json/wp/v2/pages?slug=newsletter&_fields=content,modified';
const CACHE_KEY = 'newsletters:wp:latest9';
const CACHE_TTL = 3600; // 1 hour
const LIMIT = 9;

async function ensureRedis() {
    if (!redisClient.isOpen) await redisClient.connect();
}

function decodeEntities(s) {
    return s
        .replace(/<[^>]+>/g, '')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&rsquo;|&lsquo;/g, "'")
        .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
        .replace(/&ndash;|&mdash;/g, '–')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseCampaigns(html) {
    const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const items = [];
    const counts = {};
    let m;
    while ((m = re.exec(html))) {
        const url = m[1];
        if (!/mailchi\.mp\//i.test(url)) continue;
        const text = decodeEntities(m[2]);
        counts[url] = (counts[url] || 0) + 1;
        items.push({ url, text });
    }

    // The "donate / back to Rombo" call-to-action repeats inside every entry —
    // it's the most-repeated link. Drop it so it never shows as a campaign.
    let ctaUrl = null, max = 1;
    for (const [u, c] of Object.entries(counts)) {
        if (c > max) { max = c; ctaUrl = u; }
    }

    const seen = new Set();
    const out = [];
    for (const it of items) {
        if (it.url === ctaUrl || seen.has(it.url)) continue;
        seen.add(it.url);
        out.push(it);
        if (out.length >= LIMIT) break;
    }

    // Anchor text looks like: "Wed, Jun 3– News from kenya (PEOPLE ALL OVER TOWN ARE TALKING)"
    return out.map((it, i) => {
        const text = it.text;

        let date = '';
        const dm = text.match(/^([A-Z][a-z]{2},\s*[A-Z][a-z]{2}\.?\s*\d{1,2})/);
        if (dm) date = dm[1].replace(/\s+/g, ' ');

        // The actual title sits in parentheses (closing paren is sometimes missing in the source).
        let subject;
        if (text.includes('(')) {
            subject = text.slice(text.lastIndexOf('(') + 1).replace(/\)\s*$/, '').trim();
        } else {
            // no parens: drop the leading "Date –" and the "News from kenya" label
            subject = text.replace(/^.*?[–—-]\s*/, '').trim();
        }
        subject = subject.replace(/^news from kenya\s*/i, '').trim();

        return {
            id: String(i),
            subject: subject || 'Newsletter Update',
            date,
            url: it.url,
        };
    });
}

// Public endpoint — consumed by the homepage newsletter carousel.
router.get('/', async (req, res) => {
    try {
        try {
            await ensureRedis();
            const cached = await redisClient.get(CACHE_KEY);
            if (cached) return res.json(JSON.parse(cached));
        } catch (e) {
            // cache unavailable — fall through to live fetch
        }

        const r = await fetch(WP_URL, { headers: { 'User-Agent': 'TalkTime/1.0' } });
        if (!r.ok) throw new Error(`WP REST returned ${r.status}`);
        const data = await r.json();
        const html = data?.[0]?.content?.rendered || '';
        const campaigns = parseCampaigns(html);

        // Pull each campaign's real preview image (og:image from its Mailchimp page),
        // in parallel. Best-effort: a failure just leaves image null (frontend falls back).
        await Promise.all(campaigns.map(async (c) => {
            try {
                const cr = await fetch(c.url, { headers: { 'User-Agent': 'TalkTime/1.0' }, redirect: 'follow' });
                if (!cr.ok) return;
                const chtml = await cr.text();
                // Mailchimp pages have no og:image. Real content images are user-content
                // (mcusercontent.com). The 1st is the header logo/banner; the real photo is
                // usually the 2nd. Prefer the 2nd, fall back to the 1st.
                const imgs = [...chtml.matchAll(/https:\/\/mcusercontent\.com\/[^\s"')]+\.(?:png|jpe?g|gif|webp)/gi)].map((m) => m[0]);
                if (imgs.length) c.image = imgs[1] || imgs[0];
            } catch (e) {
                // leave image unset
            }
        }));

        const payload = { success: true, count: campaigns.length, campaigns };

        try {
            await ensureRedis();
            await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(payload));
        } catch (e) {
            // caching is best-effort
        }

        res.json(payload);
    } catch (error) {
        console.error('Error fetching newsletters from WP:', error);
        res.status(502).json({ success: false, error: 'Failed to fetch newsletters', message: error.message });
    }
});


/**
 * GET /api/v1/newsletters/image?src=<mcusercontent-url>
 * Closed image proxy for newsletter campaign photos:
 *  - fetches the Mailchimp-hosted original once,
 *  - shrinks + converts to WebP (max 800px, q78) with ImageMagick,
 *  - caches the result on disk (volume-mounted, survives rebuilds),
 *  - serves with long browser-cache headers.
 * Only mcusercontent.com sources are allowed - this is not an open proxy.
 */

const IMG_CACHE_DIR = '/usr/src/app/uploads/newsletter-img';
const inFlight = new Map(); // cacheKey -> Promise

router.get('/image', async (req, res) => {
    const src = req.query.src || '';
    if (!/^https:\/\/mcusercontent\.com\/[^\s]+$/i.test(src)) {
        return res.status(400).json({ success: false, error: 'Invalid image source' });
    }

    const key = createHash('sha1').update(src).digest('hex') + '.webp';
    const outPath = path.join(IMG_CACHE_DIR, key);

    const serve = () => {
        res.set({
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=2592000, immutable'
        });
        res.sendFile(outPath);
    };

    try {
        if (fs.existsSync(outPath)) return serve();

        // Coalesce concurrent requests for the same image
        if (!inFlight.has(key)) {
            inFlight.set(key, (async () => {
                fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });
                const r = await fetch(src, {
                    headers: { 'User-Agent': 'TalkTime/1.0' },
                    signal: AbortSignal.timeout(15000)
                });
                if (!r.ok) throw new Error(`source returned ${r.status}`);
                const buf = Buffer.from(await r.arrayBuffer());
                if (buf.length > 15 * 1024 * 1024) throw new Error('source too large');

                const tmpIn = path.join(os.tmpdir(), key + '.src');
                fs.writeFileSync(tmpIn, buf);
                try {
                    await new Promise((resolve, reject) => {
                        execFile('convert',
                            [tmpIn + '[0]', '-auto-orient', '-resize', '800x800>', '-strip', '-quality', '78', outPath],
                            { timeout: 20000 },
                            (err) => err ? reject(err) : resolve());
                    });
                } finally {
                    fs.unlink(tmpIn, () => {});
                }
            })().finally(() => inFlight.delete(key)));
        }
        await inFlight.get(key);
        return serve();
    } catch (error) {
        console.error('Newsletter image proxy error:', error.message);
        // Redirect to the original as a graceful fallback
        return res.redirect(302, src);
    }
});

export default router;
