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

test("four distinct segments, Perfect exchange first and default", async () => {
  const { PEOPLE_SEGMENTS, DEFAULT_PEOPLE_SEGMENT, buildPeopleParams } = await import("../src/features/peopleMatching.ts");
  assert.deepEqual(PEOPLE_SEGMENTS.map((s) => s.key), ["reciprocal", "teaches_me", "learns_mine", "all"]);
  assert.deepEqual(PEOPLE_SEGMENTS.map((s) => s.label), ["Perfect exchange", "Native speakers", "Learning your language", "Everyone"]);
  assert.equal(DEFAULT_PEOPLE_SEGMENT, "reciprocal");
  assert.equal(buildPeopleParams({ page: 1, segment: "learns_mine", level: "" }).match, "learns_mine");
});

test("Perfect exchange shows only reciprocal people; other segments get a plain list", async () => {
  const { peopleSections } = await import("../src/features/peopleMatching.ts");
  const profiles = [
    { username: "oneway", match: { teaches_me: true } },
    ...Array.from({ length: 10 }, (_, i) => ({ username: `mutual${i}`, match: { reciprocal: true } })),
  ];
  const perfect = peopleSections(profiles, "reciprocal");
  assert.equal(perfect.rail.length, 8);
  assert.deepEqual(perfect.list.map((p) => p.username), ["mutual8", "mutual9"]);
  const native = peopleSections(profiles, "teaches_me");
  assert.equal(native.rail.length, 0);
  assert.equal(native.list.length, 11);
});

test("viewer speaks native + Advanced/Fluent languages and practises the rest", async () => {
  const { viewerExchangeLanguages } = await import("../src/features/peopleMatching.ts");
  const result = viewerExchangeLanguages({
    native_language: "Greek",
    languages_practicing: ["English", "Russian", "French"],
    practice_language_levels: { english: "Fluent", Russian: "beginner", French: "intermediate" },
  });
  assert.deepEqual(result.spoken, [{ language: "Greek", level: "native" }, { language: "English", level: "fluent" }]);
  assert.deepEqual(result.practising.map((p) => p.language), ["Russian", "French"]);
});

test("match explanations and labels use they_teach / they_learn / you_speak", async () => {
  const { matchExplanation, matchRelationship, describeExchange } = await import("../src/features/peopleMatching.ts");
  const profile = {
    username: "anya",
    native_language: "russian",
    languages_practicing: ["french", "english"],
    match: { teaches_me: true, learns_mine: true, reciprocal: true, they_teach: "russian", they_learn: "english", you_speak: "fluent" },
  };
  assert.deepEqual(matchExplanation(profile), ["They speak Russian (native)", "They're learning English, which you speak fluently"]);
  assert.equal(describeExchange(profile, "greek").learning, "English");
  assert.equal(
    matchRelationship({ teaches_me: false, learns_mine: true, reciprocal: false, they_learn: "greek", you_speak: "native" }).label,
    "Learning Greek · your native language"
  );
});
