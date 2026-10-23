// Reddit Watcher Daemon (server/reddit-watcher.js)
// Periodically checks configured subreddits and search queries for keyword matches.
// Deduplicates seen posts and routes matches to the unified notification router.

const settings = require("./settings");
const logger = require("./logger");
const redditConnector = require("./connectors/reddit");
const notifications = require("./notifications");

let timer = null;
let running = false;
const seenPostIds = new Set();
const MAX_SEEN_POSTS = 5000;

function getWatchers() {
  const cfg = settings.get().reddit || {};
  return (cfg.watchers || []).filter((w) => w.enabled !== false);
}

function matchesKeywords(post, keywords = []) {
  if (!keywords || !keywords.length) return true;
  const target = `${post.title || ""} ${post.selftext || ""}`.toLowerCase();
  return keywords.some((kw) => target.includes(String(kw).toLowerCase().trim()));
}

async function checkWatcher(watcher, redditCfg) {
  const sub = redditConnector.cleanSub(watcher.subreddit || "");
  const keywords = Array.isArray(watcher.keywords) ? watcher.keywords : (watcher.keywords || "").split(",").map((k) => k.trim()).filter(Boolean);

  let rawPosts = [];
  try {
    if (watcher.query) {
      const q = encodeURIComponent(watcher.query);
      const path = sub
        ? `/r/${sub}/search.json?q=${q}&restrict_sr=1&sort=new&limit=15`
        : `/search.json?q=${q}&sort=new&limit=15`;
      const data = await redditConnector.redditRequest(redditCfg, path);
      rawPosts = data.data?.children?.map((c) => c.data) || [];
    } else if (sub) {
      const data = await redditConnector.redditRequest(redditCfg, `/r/${sub}/new.json?limit=15`);
      rawPosts = data.data?.children?.map((c) => c.data) || [];
    }
  } catch (err) {
    logger.warn(`Reddit watcher check failed for [${watcher.name || sub}]:`, err.message);
    return [];
  }

  const matches = [];
  for (const post of rawPosts) {
    if (!post || !post.id) continue;
    if (seenPostIds.has(post.id)) continue;

    // Track as seen
    seenPostIds.add(post.id);
    if (seenPostIds.size > MAX_SEEN_POSTS) {
      const oldest = seenPostIds.values().next().value;
      seenPostIds.delete(oldest);
    }

    if (matchesKeywords(post, keywords)) {
      matches.push(post);
      // Dispatch to unified notification router
      try {
        await notifications.dispatch("reddit_match", {
          title: `r/${post.subreddit}: ${post.title}`,
          body: post.selftext ? post.selftext.slice(0, 160) : post.title,
          url: `https://reddit.com${post.permalink}`,
          meta: {
            author: post.author,
            subreddit: post.subreddit,
            score: post.score,
            postId: post.id,
          },
        });
      } catch (err) {
        logger.warn("Failed to dispatch reddit_match notification:", err.message);
      }
    }
  }

  return matches;
}

async function pollOnce() {
  const s = settings.get();
  if (s.privacy?.localOnly === true) return [];
  const redditCfg = s.reddit || {};
  if (redditCfg.enabled === false) return [];

  const watchers = getWatchers();
  if (!watchers.length) return [];

  const allMatches = [];
  for (const watcher of watchers) {
    const matches = await checkWatcher(watcher, redditCfg);
    allMatches.push(...matches);
  }
  return allMatches;
}

function start(intervalMinutes = 15) {
  if (running) return;
  running = true;
  const ms = Math.max(Number(intervalMinutes) || 15, 1) * 60 * 1000;
  timer = setInterval(() => {
    pollOnce().catch((err) => logger.warn("Reddit watcher poll error:", err.message));
  }, ms);
  timer.unref?.();
  logger.info("Reddit watcher daemon started.");
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
}

module.exports = {
  start,
  stop,
  pollOnce,
  checkWatcher,
  matchesKeywords,
  getWatchers,
  resetSeenForTesting: () => seenPostIds.clear(),
  getSeenCount: () => seenPostIds.size,
};
