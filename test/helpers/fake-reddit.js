// Fake Reddit OAuth2 & Data API Server for Testing (test/helpers/fake-reddit.js)
// Simulates Reddit OAuth token exchange, refresh, subreddit listings, comment trees,
// search, community rules, inbox messages, post/comment submissions, and 100 QPM rate limiting.

const http = require("http");

class FakeRedditServer {
  constructor(options = {}) {
    this.clientId = options.clientId || "test_client_id_123";
    this.clientSecret = options.clientSecret || "test_client_secret_abc";
    this.validRefreshToken = options.refreshToken || "valid_refresh_token_999";
    this.accessToken = "test_access_token_xyz";
    this.rateLimitRemaining = 100;
    this.rateLimitReset = 60;
    this.simulate429Once = false;
    this.submittedPosts = [];
    this.submittedComments = [];
    this.subreddits = {
      test: {
        rules: [
          { short_name: "No spam", description: "Do not post promotional links." },
          { short_name: "Be respectful", description: "Be civil and constructive." },
        ],
        posts: [
          {
            id: "t3_post1",
            title: "First Test Post in r/test",
            author: "alice",
            selftext: "Hello everyone, this is a test post.",
            subreddit: "test",
            score: 42,
            num_comments: 2,
            created_utc: Math.floor(Date.now() / 1000) - 300,
            permalink: "/r/test/comments/post1/first_test_post/",
          },
          {
            id: "t3_post2",
            title: "Second Post about Artificial Intelligence",
            author: "bob",
            selftext: "Discussion on open source AI assistants.",
            subreddit: "test",
            score: 15,
            num_comments: 0,
            created_utc: Math.floor(Date.now() / 1000) - 100,
            permalink: "/r/test/comments/post2/second_post_about_ai/",
          },
        ],
        comments: {
          post1: [
            {
              id: "t1_c1",
              author: "charlie",
              body: "Great post!",
              score: 5,
              replies: {
                data: {
                  children: [
                    {
                      kind: "t1",
                      data: {
                        id: "t1_c2",
                        author: "alice",
                        body: "Thank you Charlie!",
                        score: 2,
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
    this.inboxMessages = [
      {
        id: "t4_msg1",
        author: "reddit_user",
        subject: "Welcome to Reddit",
        body: "Thanks for joining!",
        new: true,
      },
    ];
    this.server = null;
    this.port = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(0, "127.0.0.1", () => {
        this.port = this.server.address().port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
      this.server.on("error", reject);
    });
  }

  close() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }

  url() {
    return `http://127.0.0.1:${this.port}`;
  }

  clear() {
    this.submittedPosts = [];
    this.submittedComments = [];
    this.composedPMs = [];
    this.mentions = [];
    this.readMessageIds = [];
    this.simulate429Once = false;
    this.rateLimitRemaining = 100;
  }

  async handleRequest(req, res) {
    const json = (data, code = 200, headers = {}) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "X-Ratelimit-Used": "1",
        "X-Ratelimit-Remaining": String(this.rateLimitRemaining),
        "X-Ratelimit-Reset": String(this.rateLimitReset),
        ...headers,
      });
      res.end(JSON.stringify(data));
    };

    // 1. Rate limiting simulation
    if (this.simulate429Once) {
      this.simulate429Once = false;
      return json(
        { message: "Too Many Requests", error: 429 },
        429,
        { "Retry-After": "5", "X-Ratelimit-Remaining": "0" }
      );
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
      const pathname = parsedUrl.pathname;

      // 2. OAuth Token Endpoint: /api/v1/access_token
      if (pathname === "/api/v1/access_token" && req.method === "POST") {
        const authHeader = req.headers["authorization"] || "";
        const expectedAuth = "Basic " + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
        if (authHeader !== expectedAuth) {
          return json({ error: "invalid_client" }, 401);
        }

        const params = new URLSearchParams(body);
        const grantType = params.get("grant_type");

        if (grantType === "authorization_code") {
          const code = params.get("code");
          if (code === "valid_auth_code") {
            return json({
              access_token: this.accessToken,
              token_type: "bearer",
              expires_in: 3600,
              refresh_token: this.validRefreshToken,
              scope: "*",
            });
          }
          return json({ error: "invalid_grant" }, 400);
        } else if (grantType === "refresh_token") {
          const refreshToken = params.get("refresh_token");
          if (refreshToken === this.validRefreshToken) {
            return json({
              access_token: this.accessToken,
              token_type: "bearer",
              expires_in: 3600,
              scope: "*",
            });
          }
          return json({ error: "invalid_grant" }, 400);
        }
        return json({ error: "unsupported_grant_type" }, 400);
      }

      // Check Bearer Token for all /api or /r endpoints
      const auth = req.headers["authorization"] || "";
      if (!auth.startsWith("Bearer ") || auth.slice(7) !== this.accessToken) {
        return json({ message: "Unauthorized", error: 401 }, 401);
      }

      // Check User-Agent requirements: "friends:v0.7.0 (by /u/...)"
      const ua = req.headers["user-agent"] || "";
      if (!ua.includes("friends:v0.7.0") || !ua.includes("/u/")) {
        return json({ message: "Invalid User-Agent header according to Reddit API terms", error: 400 }, 400);
      }

      // 3. Subreddit Rules: /r/{sub}/about/rules.json or /r/{sub}/about/rules
      const rulesMatch = pathname.match(/^\/r\/([^/]+)\/about\/rules(?:\.json)?$/);
      if (rulesMatch) {
        const sub = rulesMatch[1].toLowerCase();
        const subData = this.subreddits[sub] || { rules: [] };
        return json({ rules: subData.rules });
      }

      // 4. Subreddit Listings: /r/{sub}/{listing}.json
      const listingMatch = pathname.match(/^\/r\/([^/]+)\/(hot|new|top)(?:\.json)?$/);
      if (listingMatch) {
        const sub = listingMatch[1].toLowerCase();
        const subData = this.subreddits[sub] || { posts: [] };
        return json({
          kind: "Listing",
          data: {
            children: subData.posts.map((p) => ({ kind: "t3", data: p })),
          },
        });
      }

      // 5. Search: /r/{sub}/search.json or /search.json
      if (pathname.endsWith("/search.json") || pathname.endsWith("/search")) {
        const q = parsedUrl.searchParams.get("q") || "";
        const allPosts = Object.values(this.subreddits).flatMap((s) => s.posts);
        const matched = allPosts.filter(
          (p) =>
            p.title.toLowerCase().includes(q.toLowerCase()) ||
            p.selftext.toLowerCase().includes(q.toLowerCase())
        );
        return json({
          kind: "Listing",
          data: {
            children: matched.map((p) => ({ kind: "t3", data: p })),
          },
        });
      }

      // 6. Comments: /r/{sub}/comments/{id}.json
      const cleanPath = pathname.replace(/\.json$/, "");
      const commentsMatch = cleanPath.match(/^\/r\/([^/]+)\/comments\/([^/]+)$/);
      if (commentsMatch) {
        const sub = commentsMatch[1].toLowerCase();
        const id = commentsMatch[2];
        const subData = this.subreddits[sub] || { posts: [], comments: {} };
        const post = subData.posts.find((p) => p.id === `t3_${id}` || p.id === id);
        const postComments = subData.comments[id] || [];

        return json([
          {
            kind: "Listing",
            data: {
              children: post ? [{ kind: "t3", data: post }] : [],
            },
          },
          {
            kind: "Listing",
            data: {
              children: postComments.map((c) => ({ kind: "t1", data: c })),
            },
          },
        ]);
      }

      // Current User: /api/v1/me
      if (pathname === "/api/v1/me") {
        return json({
          name: "test_friends_user",
          id: "t2_test123",
          created_utc: 1600000000,
        });
      }

      // 7. Inbox: /message/inbox or /message/unread
      if (pathname.startsWith("/message/inbox") || pathname.startsWith("/message/unread")) {
        return json({
          kind: "Listing",
          data: {
            children: this.inboxMessages.map((m) => ({ kind: "t4", data: m })),
          },
        });
      }

      // Mentions: /message/mentions
      if (pathname.startsWith("/message/mentions")) {
        return json({
          kind: "Listing",
          data: {
            children: this.mentions.map((m) => ({ kind: "t1", data: m })),
          },
        });
      }

      // Compose PM: POST /api/compose
      if (pathname === "/api/compose" && req.method === "POST") {
        const params = new URLSearchParams(body);
        const pm = {
          to: params.get("to"),
          subject: params.get("subject"),
          text: params.get("text"),
          sentAt: Date.now(),
        };
        this.composedPMs.push(pm);
        return json({ json: { errors: [] } });
      }

      // Read message: POST /api/read_message
      if (pathname === "/api/read_message" && req.method === "POST") {
        const params = new URLSearchParams(body);
        this.readMessageIds.push(...(params.get("id") || "").split(","));
        return json({ json: { errors: [] } });
      }

      // 8. Submit Post: POST /api/submit
      if (pathname === "/api/submit" && req.method === "POST") {
        const params = new URLSearchParams(body);
        const submission = {
          id: `t3_${Date.now().toString(36)}`,
          title: params.get("title"),
          sr: params.get("sr"),
          kind: params.get("kind"),
          text: params.get("text"),
          url: params.get("url"),
          submittedAt: Date.now(),
        };
        this.submittedPosts.push(submission);
        return json({
          json: {
            errors: [],
            data: {
              id: submission.id,
              name: submission.id,
              url: `https://reddit.com/r/${submission.sr}/comments/${submission.id}`,
            },
          },
        });
      }

      // 9. Submit Comment: POST /api/comment
      if (pathname === "/api/comment" && req.method === "POST") {
        const params = new URLSearchParams(body);
        const comment = {
          id: `t1_${Date.now().toString(36)}`,
          parent: params.get("thing_id"),
          text: params.get("text"),
          submittedAt: Date.now(),
        };
        this.submittedComments.push(comment);
        return json({
          json: {
            errors: [],
            data: {
              things: [
                {
                  kind: "t1",
                  data: {
                    id: comment.id,
                    name: comment.id,
                    body: comment.text,
                  },
                },
              ],
            },
          },
        });
      }

      return json({ message: "Not Found", error: 404 }, 404);
    });
  }
}

module.exports = { FakeRedditServer };
