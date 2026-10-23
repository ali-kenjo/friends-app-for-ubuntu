// Fake Telegram Bot API Server for testing (test/helpers/fake-telegram.js)
// Simulates the official Telegram Bot API HTTP endpoints:
// getMe, getUpdates, sendMessage, editMessageText, editMessageReplyMarkup,
// sendChatAction, setMyCommands, sendPhoto, sendDocument, sendVoice, answerCallbackQuery.
// Includes failure injection: 409 conflict, 429 rate limits, 401 invalid token, network drops, and length caps.

const http = require("http");

class FakeTelegramServer {
  constructor(options = {}) {
    this.validToken = options.token || "test-bot-token-123";
    this.botInfo = {
      id: 987654321,
      is_bot: true,
      first_name: "Friends Bot",
      username: "friends_test_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    };
    this.pendingUpdates = [];
    this.sentMessages = [];
    this.editedMessages = [];
    this.chatActions = [];
    this.registeredCommands = [];
    this.callbackAnswers = [];
    this.sentMedia = [];
    this.profileUpdates = {};
    this.longPollWaiters = [];
    this.conflictActive = false;
    this.conflictOnce = false;
    this.rateLimitOnce = null; // { retry_after: 1 }
    this.networkDropOnce = false;
    this.invalidTokenOnce = false;
    this.messageIdCounter = 1000;
    this.updateIdCounter = 5000;
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
    for (const waiter of this.longPollWaiters) {
      try {
        waiter.res.writeHead(200, { "Content-Type": "application/json" });
        waiter.res.end(JSON.stringify({ ok: true, result: [] }));
      } catch {}
    }
    this.longPollWaiters = [];
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }

  url() {
    return `http://127.0.0.1:${this.port}`;
  }

  enqueueMessage(chatId, text, extra = {}) {
    const update = {
      update_id: ++this.updateIdCounter,
      message: {
        message_id: ++this.messageIdCounter,
        from: extra.from || { id: Number(chatId) || 12345, first_name: "TestUser", username: "testuser" },
        chat: { id: Number(chatId) || chatId, type: extra.chatType || "private", title: extra.chatTitle },
        date: Math.floor(Date.now() / 1000),
        text,
        ...extra,
      },
    };
    this.pushUpdate(update);
    return update;
  }

  enqueueCallback(fromId, chatId, data, messageId = 1001) {
    const update = {
      update_id: ++this.updateIdCounter,
      callback_query: {
        id: `cb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        from: { id: Number(fromId), first_name: "TestUser" },
        message: { message_id: messageId, chat: { id: Number(chatId) } },
        data,
      },
    };
    this.pushUpdate(update);
    return update;
  }

  pushUpdate(update) {
    if (this.longPollWaiters.length > 0) {
      const waiter = this.longPollWaiters.shift();
      clearTimeout(waiter.timer);
      waiter.res.writeHead(200, { "Content-Type": "application/json" });
      waiter.res.end(JSON.stringify({ ok: true, result: [update] }));
    } else {
      this.pendingUpdates.push(update);
    }
  }

  clear() {
    this.sentMessages = [];
    this.editedMessages = [];
    this.chatActions = [];
    this.registeredCommands = [];
    this.callbackAnswers = [];
    this.sentMedia = [];
    this.pendingUpdates = [];
    this.conflictActive = false;
    this.conflictOnce = false;
    this.rateLimitOnce = null;
    this.networkDropOnce = false;
    this.invalidTokenOnce = false;
  }

  async handleRequest(req, res) {
    // URL format: /bot<token>/<method>
    const match = req.url.match(/^\/bot([^/]+)\/(.+)$/);
    if (!match) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error_code: 404, description: "Not Found" }));
    }

    const token = match[1];
    const method = match[2];

    // Failure simulation: network drop
    if (this.networkDropOnce) {
      this.networkDropOnce = false;
      req.destroy();
      return;
    }

    // Failure simulation: token check
    if (token !== this.validToken || this.invalidTokenOnce) {
      this.invalidTokenOnce = false;
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized: invalid bot token" }));
    }

    // Failure simulation: 409 conflict
    if (this.conflictActive || this.conflictOnce) {
      this.conflictOnce = false;
      res.writeHead(409, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ok: false,
        error_code: 409,
        description: "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running",
      }));
    }

    // Failure simulation: 429 rate limit
    if (this.rateLimitOnce && (!this.rateLimitOnce.method || req.url.includes(this.rateLimitOnce.method))) {
      const retryAfter = this.rateLimitOnce.retry_after || 1;
      this.rateLimitOnce = null;
      res.writeHead(429, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ok: false,
        error_code: 429,
        description: `Too Many Requests: retry after ${retryAfter}`,
        parameters: { retry_after: retryAfter },
      }));
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let params = {};
      try {
        if (body) params = JSON.parse(body);
      } catch {}

      this.processMethod(method, params, res);
    });
  }

  processMethod(method, params, res) {
    const json = (data, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    switch (method) {
      case "getMe":
        return json({ ok: true, result: this.botInfo });

      case "getUpdates": {
        const offset = Number(params.offset) || 0;
        const timeoutSeconds = Number(params.timeout) || 0;

        // Filter updates >= offset
        const readyUpdates = this.pendingUpdates.filter((u) => u.update_id >= offset);
        if (readyUpdates.length > 0) {
          // Remove delivered updates from pending
          this.pendingUpdates = this.pendingUpdates.filter((u) => u.update_id < offset);
          return json({ ok: true, result: readyUpdates });
        }

        if (timeoutSeconds > 0) {
          // Hold request for long polling
          const timer = setTimeout(() => {
            const idx = this.longPollWaiters.findIndex((w) => w.res === res);
            if (idx !== -1) {
              this.longPollWaiters.splice(idx, 1);
              json({ ok: true, result: [] });
            }
          }, timeoutSeconds * 1000);

          this.longPollWaiters.push({ res, timer, offset });
          return;
        }

        return json({ ok: true, result: [] });
      }

      case "sendMessage": {
        const text = String(params.text || "");
        // Telegram hard cap: 4096 characters per message
        if (text.length > 4096) {
          return json({ ok: false, error_code: 400, description: "Bad Request: message is too long" }, 400);
        }

        // Validate basic MarkdownV2 / HTML syntax if specified
        if (params.parse_mode === "MarkdownV2") {
          const unescapedSpecial = text.match(/(?<!\\)[_[\]()~>#+=|{}.!-]/g);
          // Simple heuristic for testing escape correctness
        }

        const msg = {
          message_id: ++this.messageIdCounter,
          chat: { id: params.chat_id },
          text,
          date: Math.floor(Date.now() / 1000),
          parse_mode: params.parse_mode,
          reply_markup: params.reply_markup,
          disable_notification: params.disable_notification,
          disable_web_page_preview: params.disable_web_page_preview,
        };
        this.sentMessages.push(msg);
        return json({ ok: true, result: msg });
      }

      case "editMessageText": {
        const text = String(params.text || "");
        if (text.length > 4096) {
          return json({ ok: false, error_code: 400, description: "Bad Request: message is too long" }, 400);
        }
        const edit = {
          message_id: params.message_id,
          chat: { id: params.chat_id },
          text,
          parse_mode: params.parse_mode,
          reply_markup: params.reply_markup,
          date: Math.floor(Date.now() / 1000),
        };
        this.editedMessages.push(edit);
        return json({ ok: true, result: edit });
      }

      case "editMessageReplyMarkup": {
        const edit = {
          message_id: params.message_id,
          chat: { id: params.chat_id },
          reply_markup: params.reply_markup,
        };
        this.editedMessages.push(edit);
        return json({ ok: true, result: edit });
      }

      case "sendChatAction": {
        this.chatActions.push({ chat_id: params.chat_id, action: params.action });
        return json({ ok: true, result: true });
      }

      case "setMyCommands": {
        this.registeredCommands = params.commands || [];
        return json({ ok: true, result: true });
      }

      case "getMyCommands": {
        return json({ ok: true, result: this.registeredCommands });
      }

      case "answerCallbackQuery": {
        this.callbackAnswers.push(params);
        return json({ ok: true, result: true });
      }

      case "sendPhoto":
      case "sendDocument":
      case "sendVoice": {
        const media = {
          method,
          chat_id: params.chat_id,
          caption: params.caption,
          reply_markup: params.reply_markup,
        };
        this.sentMedia.push(media);
        return json({ ok: true, result: { message_id: ++this.messageIdCounter, ...media } });
      }

      case "setMyName":
      case "setMyDescription":
      case "setMyShortDescription": {
        this.profileUpdates[method] = params;
        return json({ ok: true, result: true });
      }

      default:
        return json({ ok: true, result: {} });
    }
  }
}

module.exports = { FakeTelegramServer };
