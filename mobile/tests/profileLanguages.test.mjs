import assert from "node:assert/strict";
import test from "node:test";
import { PROFILE_LANGUAGES, filterProfileLanguages, getProfileLanguageOptions } from "../src/features/profileLanguages.ts";

test("new profiles can choose Russian and all fourteen supported languages", () => {
  const options = getProfileLanguageOptions();
  assert.equal(options.length, 14);
  assert.ok(options.some(({ value }) => value === "russian"));
  assert.equal(new Set(options.map(({ value }) => value)).size, 14);
  assert.deepEqual(options.map(({ label }) => label), options.map(({ label }) => label).sort((a, b) => a.localeCompare(b, "en")));
});

test("search accepts English names, native names, codes and accent-free spelling", () => {
  for (const query of ["Russian", "русский", " RU "]) {
    assert.deepEqual(filterProfileLanguages(PROFILE_LANGUAGES, query).map(({ value }) => value), ["russian"]);
  }
  assert.equal(filterProfileLanguages(PROFILE_LANGUAGES, "portugues")[0].value, "portuguese");
  assert.equal(filterProfileLanguages(PROFILE_LANGUAGES, "Mandarin")[0].value, "chinese");
  assert.equal(filterProfileLanguages(PROFILE_LANGUAGES, "not a language").length, 0);
});

test("existing custom values survive editing without duplicate choices", () => {
  const options = getProfileLanguageOptions({ native_language: " Greek ", base_translate_language: "DUTCH", languages_practicing: ["Russian", "dutch", " Ukrainian "] });
  assert.equal(options.length, 16);
  assert.ok(options.some(({ value }) => value === "dutch"));
  assert.ok(options.some(({ value }) => value === "ukrainian"));
  assert.equal(options.filter(({ value }) => value === "russian").length, 1);
  assert.equal(options.filter(({ value }) => value === "dutch").length, 1);
});

test("empty searches show the full catalogue without changing its order", () => {
  const options = getProfileLanguageOptions(null);
  assert.deepEqual(filterProfileLanguages(options, "  "), options);
});
