import assert from "node:assert/strict";
import test from "node:test";
import { filterLoadedPeople, splitPerfectMatches } from "../src/features/peopleMatching.ts";

test("only reciprocal exchanges are highlighted and no profile is duplicated", () => {
  const profiles = [
    { username: "native", match: { teaches_me: true } },
    { username: "mutual", match: { reciprocal: true } },
    { username: "new" },
  ];
  const { perfect, remaining } = splitPerfectMatches(profiles);
  assert.deepEqual(perfect.map((p) => p.username), ["mutual"]);
  assert.deepEqual(remaining.map((p) => p.username), ["native", "new"]);
});

test("spotlight stays bounded while every additional match remains discoverable", () => {
  const profiles = Array.from({ length: 12 }, (_, i) => ({ username: `person${i}`, match: { reciprocal: true } }));
  const { perfect, remaining } = splitPerfectMatches(profiles);
  assert.equal(perfect.length, 8);
  assert.deepEqual([...perfect, ...remaining], profiles);
  assert.deepEqual(splitPerfectMatches([]), { perfect: [], remaining: [] });
});

test("search and language filters apply before highlighting", () => {
  const profiles = [
    { username: "anna", native_language: "russian", match: { reciprocal: true } },
    { username: "anne", native_language: "english", match: { reciprocal: true } },
  ];
  assert.deepEqual(splitPerfectMatches(filterLoadedPeople(profiles, "ann", "Russian")).perfect.map((p) => p.username), ["anna"]);
  assert.equal(splitPerfectMatches(filterLoadedPeople(profiles, "nobody", "")).perfect.length, 0);
});
