from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from chatapp.models import BlockedUser, Follow
from chatapp.throttles import FollowDailyRateThrottle, FollowRateThrottle
from chatapp.views import follow_user_view
from .factory import make_user


class FollowTests(TestCase):
    def test_follow_scoped_throttles(self):
        self.assertIn(FollowRateThrottle, follow_user_view.cls.throttle_classes)
        self.assertIn(FollowDailyRateThrottle, follow_user_view.cls.throttle_classes)

    def setUp(self):
        cache.clear()
        self.me = make_user(native_language="english", languages_practicing=["greek"])
        self.other = make_user(native_language="greek", languages_practicing=["english"])
        self.client = APIClient()
        self.client.force_authenticate(self.me)
        self.path = f"/api/profile/public/{self.other.username}/follow/"

    def test_follow_unfollow_idempotency_and_notification(self):
        with mock.patch("chatapp.views.broadcast") as broadcast, mock.patch(
            "chatapp.views.schedule_follow_push"
        ) as push:
            self.assertEqual(self.client.post(self.path).data["is_following"], True)
            self.assertEqual(self.client.post(self.path).data["is_following"], True)
            self.assertEqual(Follow.objects.count(), 1)
            self.assertEqual(broadcast.call_count, 1)
            self.assertEqual(push.call_count, 1)
            self.assertEqual(self.client.delete(self.path).data["is_following"], False)
            self.assertEqual(self.client.delete(self.path).data["is_following"], False)
            self.assertEqual(self.client.post(self.path).data["is_following"], True)
            self.assertEqual(broadcast.call_count, 1)
            self.assertEqual(push.call_count, 1)

    def test_errors_and_block_cleanup(self):
        self.assertEqual(self.client.post(f"/api/profile/public/{self.me.username}/follow/").data["code"], "cannot_follow_self")
        self.assertEqual(self.client.post("/api/profile/public/missing/follow/").status_code, 404)
        self.me.email_verified_at = None
        self.me.save(update_fields=["email_verified_at"])
        self.assertEqual(self.client.post(self.path).data["code"], "email_unverified")
        self.me.email_verified_at = self.other.email_verified_at
        self.me.save(update_fields=["email_verified_at"])
        self.client.post(self.path)
        self.client.post(f"/api/profile/public/{self.other.username}/block/")
        self.assertFalse(Follow.objects.exists())
        self.assertEqual(self.client.post(self.path).data["code"], "blocked")
        self.client.delete(f"/api/profile/public/{self.other.username}/block/")
        BlockedUser.objects.create(blocker=self.other, blocked=self.me)
        self.assertEqual(self.client.post(self.path).data["code"], "blocked")

    def test_profile_feed_and_following_list(self):
        self.client.post(self.path)
        profile = self.client.get(f"/api/profile/public/{self.other.username}/").json()
        self.assertTrue(profile["is_following"])
        self.assertFalse(profile["follows_you"])
        self.assertTrue(self.client.get("/api/profile/data", {"following": 1, "section": "perfect"}).json()["profiles"][0]["is_following"])
        self.assertEqual(self.client.get("/api/profile/data", {"following": 1, "section": "others"}).json()["profiles"], [])
        counts = self.client.get("/api/profile/data", {"following": 1, "section": "others", "counts": 1}).json()["counts"]
        self.assertEqual(counts, {"perfect": 1, "others": 0})
        listed = self.client.get("/api/profile/following/").json()
        self.assertEqual(listed["profiles"][0]["username"], self.other.username)
        self.assertEqual(listed["pagination"]["total_count"], 1)
        other_client = APIClient()
        other_client.force_authenticate(self.other)
        self.assertTrue(other_client.get(f"/api/profile/public/{self.me.username}/").json()["follows_you"])
        BlockedUser.objects.create(blocker=self.other, blocked=self.me)
        self.assertEqual(self.client.get("/api/profile/following/").json()["profiles"], [])
