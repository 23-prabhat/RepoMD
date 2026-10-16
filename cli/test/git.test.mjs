import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGitHubRemote } from "../dist/git.js";

test("normalizes GitHub SSH remotes", () => {
  assert.equal(
    normalizeGitHubRemote("git@github.com:openai/openai-node.git"),
    "https://github.com/openai/openai-node"
  );
});

test("normalizes GitHub HTTPS remotes", () => {
  assert.equal(
    normalizeGitHubRemote("https://github.com/openai/openai-node.git"),
    "https://github.com/openai/openai-node"
  );
});

test("rejects non-GitHub remotes", () => {
  assert.throws(() => normalizeGitHubRemote("https://gitlab.com/acme/project.git"));
});
