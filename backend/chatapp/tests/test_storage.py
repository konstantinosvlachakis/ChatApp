import os
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import SimpleTestCase


class CloudinaryMediaStorageTests(SimpleTestCase):
    def setUp(self):
        # cloudinary_storage validates credentials on import; use a dummy value.
        with patch.dict(os.environ, {"CLOUDINARY_URL": "cloudinary://k:s@demo"}):
            from chatapp.storage import CloudinaryMediaStorage

        self.storage = CloudinaryMediaStorage()

    def _save(self, name):
        with patch(
            "cloudinary.uploader.upload",
            return_value={"public_id": "media/attachments/abc_x1"},
        ) as mock_upload:
            saved_name = self.storage.save(name, ContentFile(b"data"))
        return saved_name, mock_upload.call_args.kwargs

    def test_audio_and_video_upload_as_video_resource(self):
        for name in ("attachments/abc.webm", "attachments/abc.mp3", "attachments/abc.mov"):
            saved_name, options = self._save(name)
            self.assertEqual(options["resource_type"], "video")
            self.assertEqual(
                saved_name, "media/attachments/abc_x1" + os.path.splitext(name)[1]
            )

    def test_images_upload_as_image_resource(self):
        saved_name, options = self._save("attachments/abc.jpg")
        self.assertEqual(options["resource_type"], "image")
        self.assertEqual(saved_name, "media/attachments/abc_x1.jpg")

    def test_url_uses_resource_type_from_extension(self):
        import cloudinary

        with patch.object(cloudinary.config(), "cloud_name", "demo", create=True):
            video_url = self.storage.url("media/attachments/abc_x1.webm")
            image_url = self.storage.url("media/attachments/abc_x1.jpg")

        self.assertIn("/video/upload/", video_url)
        self.assertTrue(video_url.endswith("media/attachments/abc_x1.webm"))
        self.assertIn("/image/upload/", image_url)
        self.assertTrue(image_url.endswith("media/attachments/abc_x1.jpg"))
