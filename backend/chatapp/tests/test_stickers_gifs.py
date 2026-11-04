"""Sticker and GIF messages, the sticker manifest and the GIPHY proxy
(network always mocked: ``giphy._fetch_json``)."""

import json
import os
import tempfile
from unittest import mock

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from chatapp import giphy, push
from chatapp.models import Message
from chatapp.stickers import (
    StickerManifestError,
    parse_sticker_ref,
    validate_sticker_manifest,
)
from core.security_headers import build_content_security_policy

from .factory import make_conversation, make_message, make_user


def giphy_item(gif_id="abc123", **overrides):
    item = {
        "id": gif_id,
        "title": "  Hello   there GIF ",
        "images": {
            "fixed_width": {
                "url": f"https://media2.giphy.com/media/{gif_id}/200w.gif?cid=x",
                "webp": f"https://media2.giphy.com/media/{gif_id}/200w.webp?cid=x",
                "width": "200",
                "height": "150",
            },
            "fixed_width_downsampled": {
                "url": f"https://media2.giphy.com/media/{gif_id}/200w_d.gif",
            },
            "fixed_width_still": {"url": f"https://media2.giphy.com/media/{gif_id}/200w_s.gif"},
        },
    }
    item.update(overrides)
    return item


def giphy_page(items, total=1000):
    return {"data": items, "pagination": {"total_count": total, "offset": 0}}


class StickerManifestTests(TestCase):
    def test_bundled_manifest_resolves_refs(self):
        self.assertEqual(parse_sticker_ref("lumi:wave"), ("lumi", "wave"))
        for bad in ("", "lumi", "lumi:", "lumi:nope", "other:wave", ":wave", None, "lumi:wave:x"):
            self.assertIsNone(parse_sticker_ref(bad), bad)

    def test_validation_rejects_bad_manifests(self):
        with tempfile.TemporaryDirectory() as static_dir:
            os.makedirs(os.path.join(static_dir, "p"))
            with open(os.path.join(static_dir, "p", "a.svg"), "w") as handle:
                handle.write("<svg/>")
            good = {"packs": [{"id": "p", "name": "P", "stickers": [{"id": "a", "label": "A"}]}]}
            validate_sticker_manifest(good, static_dir)
            bad_manifests = [
                {},
                {"packs": []},
                {"packs": [{"id": "P!", "name": "P", "stickers": [{"id": "a", "label": "A"}]}]},
                {"packs": [{"id": "p", "name": "", "stickers": [{"id": "a", "label": "A"}]}]},
                {"packs": [{"id": "p", "name": "P", "stickers": []}]},
                {"packs": [{"id": "p", "name": "P", "stickers": [{"id": "a", "label": ""}]}]},
                {"packs": [{"id": "p", "name": "P", "stickers": [{"id": "b", "label": "B"}]}]},
                {"packs": [{"id": "p", "name": "P", "stickers": [
                    {"id": "a", "label": "A"}, {"id": "a", "label": "A"}]}]},
                {"packs": [{"id": "p", "name": "P", "stickers": [
                    {"id": "a", "label": "A", "url": "https://evil.example/x.svg"}]}]},
                {"packs": [good["packs"][0], good["packs"][0]]},
            ]
            for manifest in bad_manifests:
                with self.assertRaises(StickerManifestError, msg=json.dumps(manifest)):
                    validate_sticker_manifest(manifest, static_dir)

    def test_sticker_packs_endpoint(self):
        client = APIClient()
        response = client.get("/api/stickers/")
        self.assertEqual(response.status_code, 401)

        client.force_authenticate(user=make_user())
        with CaptureQueriesContext(connection) as queries:
            response = client.get("/api/stickers/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(queries), 0)
        pack = response.data["packs"][0]
        self.assertEqual(pack["id"], "lumi")
        wave = next(s for s in pack["stickers"] if s["id"] == "wave")
        self.assertEqual(wave["ref"], "lumi:wave")
        self.assertTrue(wave["url"].startswith("http://testserver/"))
        self.assertTrue(wave["url"].endswith("stickers/lumi/wave.svg"))


class GiphyNormalizeTests(TestCase):
    def test_normalize_prefers_webp_and_cleans_title(self):
        gif = giphy.normalize_gif(giphy_item())
        self.assertEqual(gif["id"], "abc123")
        self.assertEqual(gif["title"], "Hello there GIF")
        self.assertTrue(gif["url"].endswith("200w.webp?cid=x"))
        self.assertTrue(gif["preview_url"].endswith("200w_d.gif"))
        self.assertTrue(gif["still_url"].endswith("200w_s.gif"))
        self.assertEqual((gif["width"], gif["height"]), (200, 150))

    def test_normalize_rejects_unsafe_media(self):
        def with_main(**main):
            item = giphy_item()
            item["images"] = {"fixed_width": {"width": "200", "height": "150", **main}}
            return item

        for item in (
            with_main(url="http://media.giphy.com/x.gif"),
            with_main(url="https://evil.example/x.gif"),
            with_main(url="https://media.giphy.com.evil.example/x.gif"),
            with_main(url="javascript:alert(1)"),
            giphy_item(gif_id="../etc"),
            giphy_item(images={}),
            None,
        ):
            self.assertIsNone(giphy.normalize_gif(item))
        item = giphy_item()
        item["images"]["fixed_width"]["height"] = "0"
        self.assertIsNone(giphy.normalize_gif(item))

    def test_unsafe_optional_urls_are_dropped(self):
        item = giphy_item()
        item["images"]["fixed_width_still"] = {"url": "https://evil.example/s.gif"}
        item["images"]["fixed_width_downsampled"] = {"url": "https://evil.example/d.gif"}
        gif = giphy.normalize_gif(item)
        self.assertIsNone(gif["still_url"])
        self.assertEqual(gif["preview_url"], gif["url"])


@override_settings(GIPHY_API_KEY="test-key")
class GifsEndpointTests(TestCase):
    url = "/api/gifs/"

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.client.force_authenticate(user=make_user())

    @override_settings(GIPHY_API_KEY="")
    def test_unavailable_without_key(self):
        with mock.patch.object(giphy, "_fetch_json") as fetch:
            response = self.client.get(self.url)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "gifs_unavailable")
        fetch.assert_not_called()

    def test_requires_auth(self):
        self.assertEqual(APIClient().get(self.url).status_code, 401)

    def test_trending_then_search_are_cached(self):
        with mock.patch.object(
            giphy, "_fetch_json", return_value=giphy_page([giphy_item("a1"), giphy_item("b2")])
        ) as fetch:
            first = self.client.get(self.url)
            second = self.client.get(self.url)
            search = self.client.get(self.url, {"q": "  hola  amigo ", "lang": "es", "offset": "24"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data, second.data)
        self.assertEqual(first.data["attribution"], "giphy")
        self.assertEqual([gif["id"] for gif in first.data["results"]], ["a1", "b2"])
        # Fewer than a full page = no more results.
        self.assertIsNone(first.data["next_offset"])
        self.assertEqual(search.status_code, 200)
        self.assertEqual(fetch.call_count, 2)
        trending_call, search_call = fetch.call_args_list
        self.assertEqual(trending_call.args[0], "/trending")
        self.assertNotIn("q", trending_call.args[1])
        self.assertEqual(search_call.args[0], "/search")
        self.assertEqual(search_call.args[1]["q"], "hola amigo")
        self.assertEqual(search_call.args[1]["lang"], "es")
        self.assertEqual(search_call.args[1]["offset"], 24)
        self.assertEqual(search_call.args[1]["rating"], "pg")

    def test_full_page_has_next_offset_and_bad_input_is_clamped(self):
        items = [giphy_item(f"id{i}") for i in range(giphy.GIPHY_PAGE_SIZE)]
        with mock.patch.object(giphy, "_fetch_json", return_value=giphy_page(items)) as fetch:
            response = self.client.get(self.url, {"q": "cat", "offset": "-5", "lang": "x;y"})
        self.assertEqual(response.data["next_offset"], giphy.GIPHY_PAGE_SIZE)
        params = fetch.call_args.args[1]
        self.assertEqual(params["offset"], 0)
        self.assertNotIn("lang", params)

    def test_upstream_failure_is_502(self):
        with mock.patch.object(giphy, "_fetch_json", side_effect=giphy.GiphyUpstreamError()):
            response = self.client.get(self.url)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["code"], "gifs_upstream_error")
        with mock.patch.object(giphy, "_fetch_json", return_value={"message": "bad"}):
            response = self.client.get(self.url, {"q": "x"})
        self.assertEqual(response.status_code, 502)

    def test_fetch_never_logs_the_key(self):
        error = OSError("boom https://api.giphy.com/v1/gifs/trending?api_key=test-key")
        with mock.patch.object(giphy, "urlopen", side_effect=error), self.assertLogs(
            "chatapp.giphy", level="WARNING"
        ) as logs:
            with self.assertRaises(giphy.GiphyUpstreamError):
                giphy._fetch_json("/trending", {})
        self.assertNotIn("test-key", "\n".join(logs.output))


class MessageSendTests(TestCase):
    def setUp(self):
        cache.clear()
        self.me = make_user()
        self.other = make_user(native_language="greek")
        self.conversation = make_conversation(sender=self.me, receiver=self.other)
        self.url = f"/api/conversations/{self.conversation.id}/messages/"
        self.client = APIClient()
        self.client.force_authenticate(user=self.me)

    def test_send_sticker(self):
        with mock.patch("chatapp.views.broadcast_chat_room_event") as broadcast:
            response = self.client.post(self.url, {"kind": "sticker", "sticker": "lumi:wave"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["kind"], "sticker")
        self.assertEqual(response.data["text"], "")
        self.assertEqual(response.data["media"]["pack"], "lumi")
        self.assertEqual(response.data["media"]["id"], "wave")
        self.assertEqual(response.data["media"]["label"], "Hello")
        self.assertTrue(response.data["media"]["url"].endswith("stickers/lumi/wave.svg"))
        self.assertFalse(response.data["can_translate"])
        message = Message.objects.get(id=response.data["id"])
        self.assertEqual(message.media, {"pack": "lumi", "id": "wave"})
        event = broadcast.call_args.kwargs["message"]
        self.assertEqual(event["kind"], "sticker")
        self.assertEqual(event["media"]["id"], "wave")

    def test_send_rejects_bad_kinds_and_mixed_content(self):
        cases = [
            ({"kind": "video"}, "invalid_kind"),
            ({"kind": "sticker", "sticker": "lumi:nope"}, "invalid_sticker"),
            ({"kind": "sticker"}, "invalid_sticker"),
            ({"kind": "sticker", "sticker": "lumi:wave", "text": "hi"}, "invalid_media_message"),
            ({"kind": "gif", "gif_id": "abc", "text": "hi"}, "invalid_media_message"),
        ]
        for payload, code in cases:
            response = self.client.post(self.url, payload)
            self.assertEqual(response.status_code, 400, payload)
            self.assertEqual(response.data["code"], code, payload)
        self.assertFalse(Message.objects.exists())

    def test_plain_text_still_works_and_defaults_to_text_kind(self):
        response = self.client.post(self.url, {"text": "hola"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["kind"], "text")
        self.assertIsNone(response.data["media"])
        response = self.client.post(self.url, {})
        self.assertEqual(response.status_code, 400)

    @override_settings(GIPHY_API_KEY="test-key")
    def test_send_gif_resolves_id_from_picker_cache(self):
        with mock.patch.object(
            giphy, "_fetch_json", return_value=giphy_page([giphy_item("abc123")])
        ) as fetch:
            self.client.get("/api/gifs/")
            response = self.client.post(
                self.url,
                {
                    "kind": "gif",
                    "gif_id": "abc123",
                    # Client-supplied media is ignored.
                    "url": "https://evil.example/x.gif",
                    "media": "https://evil.example/x.gif",
                },
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(fetch.call_count, 1)  # the send was a cache hit
        media = response.data["media"]
        self.assertEqual(media["id"], "abc123")
        self.assertEqual(media["provider"], "giphy")
        self.assertTrue(media["url"].startswith("https://media2.giphy.com/"))
        self.assertEqual((media["width"], media["height"]), (200, 150))

    @override_settings(GIPHY_API_KEY="test-key")
    def test_send_gif_cache_miss_looks_up_id(self):
        with mock.patch.object(
            giphy, "_fetch_json", return_value={"data": giphy_item("zz9")}
        ) as fetch:
            response = self.client.post(self.url, {"kind": "gif", "gif_id": "zz9"})
        self.assertEqual(response.status_code, 201)
        fetch.assert_called_once_with("/zz9", {})

    @override_settings(GIPHY_API_KEY="test-key")
    def test_send_gif_errors(self):
        with mock.patch.object(giphy, "_fetch_json", return_value=None):
            response = self.client.post(self.url, {"kind": "gif", "gif_id": "missing"})
        self.assertEqual((response.status_code, response.data["code"]), (400, "invalid_gif"))
        with mock.patch.object(giphy, "_fetch_json") as fetch:
            response = self.client.post(self.url, {"kind": "gif", "gif_id": "../../x"})
            fetch.assert_not_called()
        self.assertEqual((response.status_code, response.data["code"]), (400, "invalid_gif"))
        with mock.patch.object(giphy, "_fetch_json", side_effect=giphy.GiphyUpstreamError()):
            response = self.client.post(self.url, {"kind": "gif", "gif_id": "abc"})
        self.assertEqual((response.status_code, response.data["code"]), (502, "gifs_upstream_error"))
        with mock.patch.object(
            giphy, "_fetch_json", return_value={"data": giphy_item("other")}
        ):
            response = self.client.post(self.url, {"kind": "gif", "gif_id": "abc"})
        self.assertEqual(response.status_code, 400)
        with override_settings(GIPHY_API_KEY=""):
            response = self.client.post(self.url, {"kind": "gif", "gif_id": "abc"})
        self.assertEqual((response.status_code, response.data["code"]), (503, "gifs_unavailable"))
        self.assertFalse(Message.objects.exists())

    def test_non_member_cannot_send_sticker(self):
        outsider = APIClient()
        outsider.force_authenticate(user=make_user())
        response = outsider.post(self.url, {"kind": "sticker", "sticker": "lumi:wave"})
        self.assertEqual(response.status_code, 403)

    def test_sticker_cannot_be_edited_or_translated(self):
        sticker = make_message(
            self.conversation, self.me, text="", kind="sticker", media={"pack": "lumi", "id": "wave"}
        )
        response = self.client.patch(f"/api/messages/{sticker.id}/edit/", {"text": "sneaky"})
        self.assertEqual((response.status_code, response.data["code"]), (400, "not_editable"))
        sticker.refresh_from_db()
        self.assertEqual(sticker.text, "")

    def test_reply_quote_carries_kind_and_media(self):
        gif = make_message(
            self.conversation,
            self.other,
            text="",
            kind="gif",
            media=giphy.normalize_gif(giphy_item("q1")),
        )
        response = self.client.post(self.url, {"text": "lol", "reply_to": gif.id})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["reply_to"]["kind"], "gif")
        self.assertEqual(response.data["reply_to"]["media"]["id"], "q1")

    def test_removed_sticker_falls_back_to_label(self):
        message = make_message(
            self.conversation, self.me, text="", kind="sticker", media={"pack": "old", "id": "gone"}
        )
        response = self.client.get(f"{self.url}?page=1")
        served = next(m for m in response.data["messages"] if m["id"] == message.id)
        self.assertEqual(served["media"]["label"], "Sticker")
        self.assertIsNone(served["media"]["url"])

    def test_media_messages_add_no_queries_to_message_page(self):
        for index in range(3):
            make_message(self.conversation, self.me, text=f"t{index}")
        with CaptureQueriesContext(connection) as text_only:
            self.client.get(f"{self.url}?page=1")
        make_message(self.conversation, self.me, text="", kind="sticker",
                     media={"pack": "lumi", "id": "love"})
        make_message(self.conversation, self.other, text="", kind="gif",
                     media=giphy.normalize_gif(giphy_item("g1")))
        # The first fetch marks the partner's GIF delivered (one UPDATE).
        self.client.get(f"{self.url}?page=1")
        with CaptureQueriesContext(connection) as mixed:
            response = self.client.get(f"{self.url}?page=1")
        self.assertEqual(len(mixed), len(text_only))
        kinds = [m["kind"] for m in response.data["messages"]]
        self.assertEqual(kinds, ["text", "text", "text", "sticker", "gif"])


class MediaPushAndCspTests(TestCase):
    def test_push_body_for_media_kinds(self):
        self.assertEqual(push.build_message_push_body("", None, "sticker"), "✨ Sticker")
        self.assertEqual(push.build_message_push_body("", None, "gif"), "🎞️ GIF")
        self.assertEqual(push.build_message_push_body("hi", None, "text"), "hi")

    def test_csp_allows_giphy_images(self):
        self.assertIn("https://*.giphy.com", build_content_security_policy())
