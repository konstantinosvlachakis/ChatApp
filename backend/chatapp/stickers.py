"""Built-in sticker packs.

Packs are listed in ``sticker_packs.json``; each sticker's image is the static
file ``chatapp/static/stickers/<pack>/<id>.svg``. The manifest is validated
once at import (an invalid manifest or a missing image fails at startup).

A sticker message stores only ``{"pack", "id"}``; the URL is resolved when the
message is serialized. Don't remove or rename a sticker that has been sent:
old messages would fall back to their label. Add new ones freely.
"""

import json
import os
import re

from django.templatetags.static import static

STICKER_MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "sticker_packs.json")
STICKER_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static", "stickers")
STICKER_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
STICKER_LABEL_MAX_LENGTH = 40


class StickerManifestError(ValueError):
    pass


def validate_sticker_manifest(manifest, static_dir=STICKER_STATIC_DIR):
    packs = manifest.get("packs") if isinstance(manifest, dict) else None
    if not isinstance(packs, list) or not packs:
        raise StickerManifestError("Manifest needs a non-empty 'packs' list.")
    seen_packs = set()
    for pack in packs:
        pack_id = pack.get("id") if isinstance(pack, dict) else None
        if not isinstance(pack_id, str) or not STICKER_ID_RE.match(pack_id):
            raise StickerManifestError(f"Invalid pack id: {pack_id!r}")
        if pack_id in seen_packs:
            raise StickerManifestError(f"Duplicate pack id: {pack_id}")
        seen_packs.add(pack_id)
        name = pack.get("name")
        if not isinstance(name, str) or not name.strip():
            raise StickerManifestError(f"Pack {pack_id} needs a name.")
        stickers = pack.get("stickers")
        if not isinstance(stickers, list) or not stickers:
            raise StickerManifestError(f"Pack {pack_id} has no stickers.")
        seen_stickers = set()
        for sticker in stickers:
            sticker_id = sticker.get("id") if isinstance(sticker, dict) else None
            if not isinstance(sticker_id, str) or not STICKER_ID_RE.match(sticker_id):
                raise StickerManifestError(f"Invalid sticker id in {pack_id}: {sticker_id!r}")
            if sticker_id in seen_stickers:
                raise StickerManifestError(f"Duplicate sticker id: {pack_id}/{sticker_id}")
            seen_stickers.add(sticker_id)
            label = sticker.get("label")
            if (
                not isinstance(label, str)
                or not label.strip()
                or len(label) > STICKER_LABEL_MAX_LENGTH
            ):
                raise StickerManifestError(f"Sticker {pack_id}/{sticker_id} needs a label.")
            if set(sticker) - {"id", "label"}:
                raise StickerManifestError(f"Unknown keys on {pack_id}/{sticker_id}.")
            if not os.path.isfile(os.path.join(static_dir, pack_id, f"{sticker_id}.svg")):
                raise StickerManifestError(f"Missing image for {pack_id}/{sticker_id}.")
    return packs


def load_sticker_packs(path=STICKER_MANIFEST_PATH):
    with open(path, encoding="utf-8") as handle:
        return validate_sticker_manifest(json.load(handle))


STICKER_PACKS = load_sticker_packs()
# {(pack_id, sticker_id): label}
STICKERS = {
    (pack["id"], sticker["id"]): sticker["label"]
    for pack in STICKER_PACKS
    for sticker in pack["stickers"]
}


def parse_sticker_ref(value):
    """``"lumi:wave"`` -> ``("lumi", "wave")`` if it names a known sticker, else None."""
    pack_id, separator, sticker_id = str(value or "").strip().partition(":")
    if not separator or (pack_id, sticker_id) not in STICKERS:
        return None
    return pack_id, sticker_id


def sticker_path(pack_id, sticker_id):
    return static(f"stickers/{pack_id}/{sticker_id}.svg")


def absolute_static_url(request, path):
    if request is None:
        return path
    url = request.build_absolute_uri(path)
    if request.get_host().endswith(("herokuapp.com", "langvoyage.com")):
        url = url.replace("http://", "https://", 1)
    return url


def sticker_media_payload(media, request=None):
    """Serialized ``media`` for a sticker message: stored ref + label and URL
    (``url`` None if the sticker is no longer in the manifest)."""
    pack_id = str(media.get("pack") or "")
    sticker_id = str(media.get("id") or "")
    label = STICKERS.get((pack_id, sticker_id))
    return {
        "pack": pack_id,
        "id": sticker_id,
        "label": label or "Sticker",
        "url": absolute_static_url(request, sticker_path(pack_id, sticker_id)) if label else None,
    }


def sticker_packs_payload(request=None):
    return [
        {
            "id": pack["id"],
            "name": pack["name"],
            "stickers": [
                {
                    "id": sticker["id"],
                    "ref": f"{pack['id']}:{sticker['id']}",
                    "label": sticker["label"],
                    "url": absolute_static_url(request, sticker_path(pack["id"], sticker["id"])),
                }
                for sticker in pack["stickers"]
            ],
        }
        for pack in STICKER_PACKS
    ]
