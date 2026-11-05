import assert from "node:assert/strict";
import test from "node:test";
import { resolveSpeechLanguage, speechCodeFor } from "../src/components/chat/speech.ts";

test("language names and codes map to voices", () => {
  assert.equal(speechCodeFor("spanish"), "es-ES");
  assert.equal(speechCodeFor("ES"), "es-ES");
  assert.equal(speechCodeFor("pt-BR"), "pt-PT");
  assert.equal(speechCodeFor("auto"), null);
  assert.equal(speechCodeFor("klingon"), null);
  assert.equal(speechCodeFor(null), null);
});

test("an unambiguous script decides the voice", () => {
  assert.equal(resolveSpeechLanguage("Καλημέρα", ["spanish"]), "el-GR");
  assert.equal(resolveSpeechLanguage("Привет"), "ru-RU");
  assert.equal(resolveSpeechLanguage("こんにちは"), "ja-JP");
  assert.equal(resolveSpeechLanguage("你好"), "zh-CN");
  assert.equal(resolveSpeechLanguage("안녕하세요"), "ko-KR");
});

test("Latin text uses the hints in order, else the device default", () => {
  // Detected translation source first, then the sender's native language.
  assert.equal(resolveSpeechLanguage("Hola, que tal", ["es", "english"]), "es-ES");
  assert.equal(resolveSpeechLanguage("Ciao", [null, "italian"]), "it-IT");
  assert.equal(resolveSpeechLanguage("Hello", []), undefined);
});
