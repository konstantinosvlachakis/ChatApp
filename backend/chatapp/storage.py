import os

import cloudinary
import cloudinary.uploader
from cloudinary_storage.storage import RESOURCE_TYPES, MediaCloudinaryStorage


# Cloudinary stores audio under the "video" resource type.
VIDEO_RESOURCE_EXTENSIONS = frozenset(
    {".mp4", ".webm", ".mov", ".ogg", ".mp3", ".wav", ".m4a", ".aac"}
)


class CloudinaryMediaStorage(MediaCloudinaryStorage):
    """Media storage for attachments that may be images, video or audio.

    The stock MediaCloudinaryStorage uploads everything as an image, so video and
    audio uploads fail. Here the resource type is picked from the file extension,
    and the extension is kept on the stored name so the type can be derived again
    when building URLs or deleting.
    """

    def _get_resource_type(self, name):
        extension = os.path.splitext(str(name))[1].lower()
        if extension in VIDEO_RESOURCE_EXTENSIONS:
            return RESOURCE_TYPES["VIDEO"]
        return RESOURCE_TYPES["IMAGE"]

    def _save(self, name, content):
        public_id = super()._save(name, content)
        extension = os.path.splitext(str(name))[1].lower()
        return f"{public_id}{extension}" if extension else public_id

    def _split_name(self, name):
        name = self._prepend_prefix(self._normalise_name(str(name)))
        public_id, extension = os.path.splitext(name)
        return name, public_id, extension

    def _get_url(self, name):
        name, public_id, extension = self._split_name(name)
        if not extension:
            return super()._get_url(name)
        resource = cloudinary.CloudinaryResource(
            public_id,
            format=extension[1:],
            default_resource_type=self._get_resource_type(name),
        )
        return resource.url

    def delete(self, name):
        name, public_id, extension = self._split_name(name)
        response = cloudinary.uploader.destroy(
            public_id if extension else name,
            invalidate=True,
            resource_type=self._get_resource_type(name),
        )
        return response.get("result") == "ok"
