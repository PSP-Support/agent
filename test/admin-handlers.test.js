import test from "node:test";
import assert from "node:assert/strict";
import { registerAdminHandlers } from "../handlers/admin.js";

test("admin module registers the command and international management callbacks", () => {
  const commands = [];
  const callbacks = [];
  const bot = {
    command: (name, handler) => commands.push({ name, handler }),
    callbackQuery: (pattern, handler) => callbacks.push({ pattern, handler }),
  };
  registerAdminHandlers({
    bot,
    pool: {},
    ownerTelegramId: "admin",
    internationalAllowed: async () => false,
    showAdminPanel: async () => {},
    country: () => null,
    edit: async () => {},
    K: () => ({}),
    say: async () => {},
    get: async () => null,
    money: String,
    fmt: String,
  });
  assert.deepEqual(commands.map(({ name }) => name), ["admin"]);
  assert.equal(callbacks.length, 14);
});
