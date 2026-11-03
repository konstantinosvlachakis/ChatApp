import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PANEL_FILTERS,
  DEFAULT_QUICK_FILTERS,
  QUICK_FILTER_KEYS,
  activePanelFilterCount,
  countParams,
  exchangeRule,
  filterLoadedPeople,
  hasOwnPhoto,
  mergePeoplePages,
  othersParams,
  parseFilterMeta,
  perfectParams,
  photoCardChip,
  photoCardStats,
  previewTotal,
  profileChips,
  quickFilterLabel,
  relationshipTag,
  toggleLanguage,
  viewerExchangeLanguages,
} from "../src/features/peopleMatching.ts";

test("perfect and others params share filters; include and sort only for More people", () => {
  const filters = {
    ...DEFAULT_PANEL_FILTERS,
    theyLearn: ["greek"],
    level: "intermediate",
    sort: "active",
    include: { native: false, learners: true, rest: true },
  };
  const quick = { ...DEFAULT_QUICK_FILTERS, near: true, newMembers: true };
  assert.deepEqual(perfectParams(filters, quick, 1), { page: 1, page_size: 24, section: "perfect", they_learn: "greek", level: "intermediate", near: 1, new: 1 });
  assert.deepEqual(othersParams(filters, quick, 2), {
    page: 2,
    page_size: 24,
    section: "others",
    they_learn: "greek",
    level: "intermediate",
    near: 1,
    new: 1,
    include: "learners,rest",
    sort: "active",
  });
  assert.equal(countParams(filters, quick).counts, 1);
  assert.deepEqual(othersParams(DEFAULT_PANEL_FILTERS, DEFAULT_QUICK_FILTERS, 1), { page: 1, page_size: 24, section: "others" });
});

test("no old segment params are sent", () => {
  const params = perfectParams(DEFAULT_PANEL_FILTERS, DEFAULT_QUICK_FILTERS, 1);
  assert.equal("match" in params, false);
});

test("language chips: all on = null, last chip stays on; badge counts changed panel filters", () => {
  const options = ["english", "russian"];
  assert.deepEqual(toggleLanguage(null, "english", options), ["russian"]);
  assert.deepEqual(toggleLanguage(["russian"], "russian", options), ["russian"]);
  assert.equal(toggleLanguage(["russian"], "english", options), null);
  assert.equal(activePanelFilterCount(DEFAULT_PANEL_FILTERS), 0);
  assert.equal(activePanelFilterCount({ ...DEFAULT_PANEL_FILTERS, theySpeak: ["russian"], level: "beginner" }), 2);
});

test("Show N people adds both sections unless More people is switched off", () => {
  assert.equal(previewTotal({ perfect: 3, others: 9 }, DEFAULT_PANEL_FILTERS), 12);
  assert.equal(previewTotal({ perfect: 3, others: 9 }, { ...DEFAULT_PANEL_FILTERS, include: { native: false, learners: false, rest: false } }), 3);
  assert.equal(previewTotal(undefined, DEFAULT_PANEL_FILTERS), null);
});

test("quick filter labels include the city; filter meta is parsed defensively", () => {
  assert.deepEqual(QUICK_FILTER_KEYS.map((key) => quickFilterLabel(key, "Athens")), ["Near you · Athens", "Active today", "New members", "Your level"]);
  assert.equal(quickFilterLabel("near", ""), "Near you");
  assert.deepEqual(parseFilterMeta({ they_speak_options: ["russian", 3], near_available: true, near_city: "Athens", near_scope: "moon" }), {
    theySpeakOptions: ["russian"],
    theyLearnOptions: [],
    nearAvailable: true,
    nearCity: "Athens",
    nearScope: "",
    myLevelAvailable: false,
  });
  assert.equal(parseFilterMeta(null), null);
});

test("header rule names what they speak and learn", () => {
  assert.equal(exchangeRule(["russian"], ["greek", "english"]), "They speak Russian and are learning Greek or English.");
  assert.equal(exchangeRule([], []), "Add your languages to find people to practise with.");
});

test("viewer speaks native + Advanced/Fluent languages and practises the rest", () => {
  const result = viewerExchangeLanguages({
    native_language: "Greek",
    languages_practicing: ["English", "Russian", "French"],
    practice_language_levels: { english: "Fluent", Russian: "beginner", French: "intermediate" },
  });
  assert.deepEqual(result.spoken, [{ language: "Greek", level: "native" }, { language: "English", level: "fluent" }]);
  assert.deepEqual(result.practising.map((p) => p.language), ["Russian", "French"]);
});

test("plain card tags and chips use the match and profile fields", () => {
  assert.equal(relationshipTag({ username: "a", match: { learns_mine: true, they_learn: "greek" } }), "Learning Greek");
  assert.equal(relationshipTag({ username: "a", native_language: "russian", match: { teaches_me: true } }), "Native Russian speaker");
  assert.equal(relationshipTag({ username: "a", match: { reciprocal: true } }), "Perfect exchange");
  assert.equal(relationshipTag({ username: "a" }), "Open to exchange");
  const profile = { username: "anya", languages_practicing: ["french", "english"], practice_language_levels: { English: "fluent" }, active_label: "Active today", is_new: true };
  assert.deepEqual(profileChips(profile), ["French", "English · Fluent", "Active today", "New member"]);
  assert.deepEqual(profileChips({ username: "x", languages_practicing: ["a", "b", "c", "d"], active_label: "Active this week" }), ["A", "B", "C"]);
});

test("photo card chip, stats and photo detection", () => {
  const base = {
    username: "anya",
    native_language: "russian",
    languages_practicing: ["english"],
    practice_language_levels: { english: "intermediate" },
    match: { reciprocal: true, teaches_me: true, learns_mine: true, they_teach: "russian", they_learn: "english" },
  };
  assert.equal(photoCardChip(base, "greek"), "Intermediate English");
  assert.equal(photoCardChip({ ...base, is_new: true }, "greek"), "New member");
  assert.equal(photoCardChip({ ...base, is_new: true, active_label: "Active today" }, "greek"), "Active today");
  assert.deepEqual(photoCardStats(base, "greek"), { speaks: "Russian", learning: "English" });
  assert.equal(hasOwnPhoto("https://api.example.test/media/profile_images/MainAfter.jpg"), false);
  assert.equal(hasOwnPhoto("https://res.cloudinary.com/demo/image/upload/v1/a.jpg"), true);
  assert.equal(hasOwnPhoto(null), false);
});

test("pages merge by username; search covers city", () => {
  const merged = mergePeoplePages([{ username: "a" }, { username: "b" }], [{ username: "b", city: "Athens" }, { username: "c" }], false);
  assert.deepEqual(merged.map((p) => p.username), ["a", "b", "c"]);
  assert.deepEqual(filterLoadedPeople(merged, "athens").map((p) => p.username), ["b"]);
});
