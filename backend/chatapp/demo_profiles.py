"""Visibly fictional People fixtures; safe to rerun, with no chat creation.

English, Mandarin (app key ``chinese``), Russian, Spanish and Arabic are the
requested demo languages. Portraits are randomuser.me sample images.
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
PERSONAS = {
    "english": (
        ("emma_brooks", "London, UK"), ("noah_reed", "Toronto, Canada"),
        ("olivia_bennett", "Melbourne, Australia"), ("ethan_clarke", "Bristol, UK"),
        ("ava_morgan", "Dublin, Ireland"), ("lucas_hayes", "Vancouver, Canada"),
        ("mia_parker", "Sydney, Australia"), ("liam_foster", "Edinburgh, UK"),
        ("ella_wright", "Wellington, New Zealand"), ("james_turner", "Boston, USA"),
    ),
    "chinese": (
        ("mei_lin", "Taipei, Taiwan"), ("wei_chen", "Shanghai, China"),
        ("xiaoyu_zhang", "Beijing, China"), ("hao_wang", "Chengdu, China"),
        ("yue_liu", "Hangzhou, China"), ("jun_zhao", "Nanjing, China"),
        ("jia_sun", "Kaohsiung, Taiwan"), ("bo_huang", "Suzhou, China"),
        ("jia_xu", "Xiamen, China"), ("ming_zhou", "Tianjin, China"),
    ),
    "russian": (
        ("anna_sokolova", "Moscow, Russia"), ("ivan_petrov", "Saint Petersburg, Russia"),
        ("maria_volkova", "Kazan, Russia"), ("dmitri_orlov", "Novosibirsk, Russia"),
        ("elena_morozova", "Yekaterinburg, Russia"), ("alexei_ivanov", "Samara, Russia"),
        ("daria_lebedeva", "Nizhny Novgorod, Russia"), ("nikita_belov", "Perm, Russia"),
        ("sofia_egorova", "Vladivostok, Russia"), ("pavel_kozlov", "Kaliningrad, Russia"),
    ),
    "spanish": (
        ("lucia_garcia", "Madrid, Spain"), ("mateo_ruiz", "Mexico City, Mexico"),
        ("sofia_torres", "Bogota, Colombia"), ("diego_morales", "Valencia, Spain"),
        ("valentina_rojas", "Santiago, Chile"), ("nicolas_vega", "Buenos Aires, Argentina"),
        ("camila_castro", "Lima, Peru"), ("alejandro_soto", "Seville, Spain"),
        ("elena_navarro", "Montevideo, Uruguay"), ("pablo_mendez", "Guadalajara, Mexico"),
    ),
    "arabic": (
        ("layla_haddad", "Amman, Jordan"), ("omar_nasser", "Cairo, Egypt"),
        ("nour_khalil", "Beirut, Lebanon"), ("youssef_mansour", "Rabat, Morocco"),
        ("salma_farouk", "Alexandria, Egypt"), ("adam_saleh", "Muscat, Oman"),
        ("mariam_amin", "Tunis, Tunisia"), ("karim_abbas", "Doha, Qatar"),
        ("hana_ismail", "Jeddah, Saudi Arabia"), ("sami_hassan", "Abu Dhabi, UAE"),
    ),
}
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


def demo_profile_specs(per_language=8):
    if not 5 <= per_language <= 10:
        raise CommandError("Choose between 5 and 10 profiles per language.")
    specs = []
    for group, native in enumerate(LANGUAGES):
        others = [language for language in LANGUAGES if language != native]
        targets = ["greek", *others, "french", "german", "portuguese", *others[:2]]
        for index, (name, location) in enumerate(PERSONAS[native][:per_language]):
            primary = targets[index]
            secondary = next(language for language in others[index % 4:] + others[:index % 4] if language != primary)
            position = group * 10 + index
            portrait_group = "women" if index % 2 == 0 else "men"
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
                "profile_image_url": f"https://randomuser.me/api/portraits/{portrait_group}/{10 + position // 2}.jpg",
                "avatar_ring_color": RING_COLOURS[group],
            })
    return specs


def seed_demo_profiles(per_language=8, dry_run=False):
    """Create missing fixtures; reject collisions and never update existing rows."""
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
        for spec in specs:
            named = by_name.get(spec["username"])
            emailed = by_email.get(spec["email"])
            if named or emailed:
                if (not named or not emailed or named.pk != emailed.pk or
                        named.has_usable_password() or not named.bio.startswith(DEMO_BIO_PREFIX)):
                    raise CommandError(f"Reserved demo identity is already in use: {spec['username']}. No data changed.")
                existing += 1
            else:
                missing.append(Profile(**spec, password=make_password(None),
                                       email_verified_at=None, is_online=False, ws_connection_count=0))
        if not dry_run and missing:
            Profile.objects.bulk_create(missing)
            from .views import bump_profile_list_cache_version
            transaction.on_commit(bump_profile_list_cache_version)
    return {"created": 0 if dry_run else len(missing), "would_create": len(missing),
            "existing": existing, "per_language": per_language, "total": len(specs)}
