"""Visibly fictional People fixtures; safe to rerun, with no chat creation.

English, Mandarin (app key ``chinese``), Russian, Spanish and Arabic are the
requested demo languages. Portraits are 600px pravatar.cc sample photos, picked by hand
per persona (adults, faces visible); pravatar only has 70, hence five per language.
"""
from datetime import date

from django.contrib.auth.hashers import make_password
from django.core.management.base import CommandError
from django.db import transaction
from django.db.models import Q
from django.db.models.functions import Lower

from .models import Profile

DEMO_BIO_PREFIX = "Demo profile. Fictional account for exploring LangVoyage. "
DEMO_EMAIL_DOMAIN = "people-demo.example.invalid"
LANGUAGES = ("english", "chinese", "russian", "spanish", "arabic")
# (username, location, pravatar.cc image id). Order is part of each fixture's identity (the
# email is numbered by position), so keep existing personas in place.
PERSONAS = {
    "english": (
        ("emma_brooks", "London, UK", 5), ("noah_reed", "Toronto, Canada", 8),
        ("olivia_bennett", "Melbourne, Australia", 45), ("ethan_clarke", "Bristol, UK", 12),
        ("ava_morgan", "Dublin, Ireland", 26),
    ),
    "chinese": (
        ("mei_lin", "Taipei, Taiwan", 25), ("wei_chen", "Shanghai, China", 62),
        ("xiaoyu_zhang", "Beijing, China", 31), ("hao_wang", "Chengdu, China", 33),
        ("yue_liu", "Hangzhou, China", 41),
    ),
    "russian": (
        ("anna_sokolova", "Moscow, Russia", 9), ("ivan_petrov", "Saint Petersburg, Russia", 13),
        ("maria_volkova", "Kazan, Russia", 23), ("dmitri_orlov", "Novosibirsk, Russia", 57),
        ("elena_morozova", "Yekaterinburg, Russia", 36),
    ),
    "spanish": (
        ("lucia_garcia", "Madrid, Spain", 44), ("mateo_ruiz", "Mexico City, Mexico", 14),
        ("sofia_torres", "Bogota, Colombia", 49), ("diego_morales", "Valencia, Spain", 61),
        ("valentina_rojas", "Santiago, Chile", 38),
    ),
    "arabic": (
        ("layla_haddad", "Amman, Jordan", 48), ("omar_nasser", "Cairo, Egypt", 59),
        ("nour_khalil", "Beirut, Lebanon", 42), ("youssef_mansour", "Rabat, Morocco", 60),
        ("salma_farouk", "Alexandria, Egypt", 47),
    ),
}
MAX_PER_LANGUAGE = 5
PORTRAIT_URL = "https://i.pravatar.cc/600?img={}"
INTERESTS = (
    "Bookshop browser, weekend baker and enthusiastic museum visitor.",
    "I enjoy cycling, indie films and trying new recipes.",
    "Coffee, photography and long walks are my favourite ways to explore a city.",
    "A home cook who likes live music and conversations about travel.",
    "I love coastal walks, historical novels and discovering small cafes.",
    "A keen hiker learning to talk about the places I visit.",
    "I spend my weekends at markets, drawing and learning something new.",
    "Board games, science podcasts and friendly conversation suit me best.",
    "A theatre fan who enjoys gardening and thoughtful conversations.",
    "I like running, architecture and exchanging recommendations for books.",
)
GOALS = (
    "I'd like relaxed conversations in {target} about food, travel and everyday life.",
    "Working on my {target} confidence, one friendly conversation at a time.",
    "I'd love to exchange film and book recommendations while practising {target}.",
    "Learning {target} for future trips and meeting people along the way.",
    "Looking for a patient partner to practise natural {target} conversation.",
    "I want to describe my day in {target} without reaching for a dictionary.",
    "Hoping to learn everyday {target} expressions and share a few stories.",
    "I'd like short, regular conversations in {target} about our interests.",
    "Practising {target} so I can make friends when I travel.",
    "I'd enjoy chatting in {target} about music, science and life in our cities.",
)
LEVELS = ("beginner", "intermediate", "advanced")
RING_COLOURS = ("#1b7f79", "#bf6c4c", "#87578a", "#476b96", "#8a6a2c")


def demo_profile_specs(per_language=MAX_PER_LANGUAGE):
    if not 1 <= per_language <= MAX_PER_LANGUAGE:
        raise CommandError(f"Choose between 1 and {MAX_PER_LANGUAGE} profiles per language.")
    specs = []
    for group, native in enumerate(LANGUAGES):
        others = [language for language in LANGUAGES if language != native]
        targets = ["greek", *others, "french", "german", "portuguese", *others[:2]]
        for index, (name, location, portrait) in enumerate(PERSONAS[native][:per_language]):
            primary = targets[index]
            secondary = next(language for language in others[index % 4:] + others[:index % 4] if language != primary)
            position = group * 10 + index
            native_label = "Mandarin Chinese" if native == "chinese" else native.title()
            specs.append({
                "username": f"demo_{name}",
                "email": f"{native}.{index + 1:02d}@{DEMO_EMAIL_DOMAIN}",
                "native_language": native,
                "base_translate_language": primary,
                "languages_practicing": [primary, secondary],
                "practice_language_levels": {primary: LEVELS[index % 3], secondary: LEVELS[(index + 1) % 3]},
                "bio": DEMO_BIO_PREFIX + f"I speak {native_label}. " + INTERESTS[(index + group) % 10],
                "learning_goal": GOALS[index].format(target=primary.title()),
                "location": location,
                "date_of_birth": date(1988 + position % 15, 1 + index % 12, 5 + index),
                "profile_image_url": PORTRAIT_URL.format(portrait),
                "avatar_ring_color": RING_COLOURS[group],
            })
    return specs


def _is_demo_row(user):
    return (user.username.lower().startswith("demo_") and (user.email or "").lower().endswith("@" + DEMO_EMAIL_DOMAIN)
            and user.bio.startswith(DEMO_BIO_PREFIX) and not user.has_usable_password())


def seed_demo_profiles(per_language=MAX_PER_LANGUAGE, dry_run=False, refresh_photos=False, prune=False):
    """Create missing fixtures; reject collisions. Existing rows are left alone unless
    ``refresh_photos`` (update their portrait URL) or ``prune`` (delete demo rows that are no
    longer in the spec, with their chats) is passed."""
    specs = demo_profile_specs(per_language)
    with transaction.atomic():
        matches = list(Profile.objects.annotate(
            seed_username=Lower("username"), seed_email=Lower("email")
        ).filter(Q(seed_username__in=[spec["username"] for spec in specs]) |
                 Q(seed_email__in=[spec["email"] for spec in specs])))
        by_name = {user.username.lower(): user for user in matches}
        by_email = {(user.email or "").lower(): user for user in matches}
        missing = []
        existing = 0
        stale_photos = []
        for spec in specs:
            named = by_name.get(spec["username"])
            emailed = by_email.get(spec["email"])
            if named or emailed:
                if (not named or not emailed or named.pk != emailed.pk or
                        named.has_usable_password() or not named.bio.startswith(DEMO_BIO_PREFIX)):
                    raise CommandError(f"Reserved demo identity is already in use: {spec['username']}. No data changed.")
                existing += 1
                if refresh_photos and named.profile_image_url != spec["profile_image_url"]:
                    named.profile_image_url = spec["profile_image_url"]
                    stale_photos.append(named)
            else:
                missing.append(Profile(**spec, password=make_password(None),
                                       email_verified_at=None, is_online=False, ws_connection_count=0))
        wanted = {spec["username"] for spec in specs}
        extra = []
        if prune:
            candidates = Profile.objects.filter(username__istartswith="demo_", email__iendswith="@" + DEMO_EMAIL_DOMAIN)
            extra = [user for user in candidates if user.username.lower() not in wanted and _is_demo_row(user)]
        if not dry_run:
            if missing:
                Profile.objects.bulk_create(missing)
            if stale_photos:
                Profile.objects.bulk_update(stale_photos, ["profile_image_url"])
            if extra:
                Profile.objects.filter(pk__in=[user.pk for user in extra]).delete()
            if missing or stale_photos or extra:
                from .views import bump_profile_list_cache_version
                transaction.on_commit(bump_profile_list_cache_version)
    return {"created": 0 if dry_run else len(missing), "would_create": len(missing),
            "existing": existing, "per_language": per_language, "total": len(specs),
            "refreshed": 0 if dry_run else len(stale_photos), "would_refresh": len(stale_photos),
            "pruned": 0 if dry_run else len(extra), "would_prune": len(extra)}
