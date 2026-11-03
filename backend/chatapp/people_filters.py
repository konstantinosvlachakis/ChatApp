"""Query-param parsing and filters for the People list (``profile_data_view``).

Pure helpers: they build ``Q`` objects and small payload values; the view owns
the queryset, cache and pagination. Definitions (also in system-map flows §10):

- section=perfect: teaches_me AND learns_mine. section=others: everyone else,
  narrowed by ``include`` (native = teaches_me only, learners = learns_mine
  only, rest = neither).
- they_speak / they_learn: subsets of the viewer's learning / spoken languages.
  They narrow which native speakers (teaches_me) and which learners
  (learns_mine) are shown; people outside that group are unaffected.
- near: same city as the viewer (``Profile.location`` "City, Country", case-
  insensitive); when nobody shares the city, same country. Coordinates are
  never used.
- active: online or seen in the last 24 h. new: joined in the last 7 days
  (NULL ``date_joined`` = an account older than the field, never new).
- my_level: their level in a viewer-spoken language they practise is within
  one step (beginner < intermediate < advanced < fluent) of the viewer's level
  in the language they teach (their native language); for people who don't
  teach the viewer, any language the viewer practises at a set level.
"""

from datetime import timedelta

from django.db.models import Q

PEOPLE_SECTIONS = {"perfect", "others"}
PEOPLE_INCLUDE_GROUPS = ("native", "learners", "rest")
PEOPLE_SORTS = {"best", "active", "newest"}
LEVEL_ORDER = ["beginner", "intermediate", "advanced", "fluent"]
# `level=` values: one level, or advanced_plus = Advanced or Fluent.
PEOPLE_LEVEL_FILTERS = {*LEVEL_ORDER, "advanced_plus"}
ACTIVE_TODAY_WINDOW = timedelta(hours=24)
ACTIVE_WEEK_WINDOW = timedelta(days=7)
NEW_MEMBER_WINDOW = timedelta(days=7)
TRUE_VALUES = {"1", "true", "yes", "on"}


def parse_flag(value):
    return str(value or "").strip().lower() in TRUE_VALUES


def parse_choice(value, allowed, default=""):
    value = str(value or "").strip().lower()
    return value if value in allowed else default


def parse_language_subset(raw, allowed):
    """Valid tokens of a comma list, in ``allowed`` order; None = no narrowing.

    Unknown values are ignored. A missing param, no valid token, or every
    allowed language selected all mean "no narrowing".
    """
    if raw is None:
        return None
    wanted = {token.strip().lower() for token in str(raw).split(",") if token.strip()}
    subset = [language for language in allowed if language in wanted]
    if not subset or len(subset) == len(allowed):
        return None
    return subset


def parse_include(raw):
    """Subset of PEOPLE_INCLUDE_GROUPS; None = all groups (also for no valid value)."""
    if raw is None:
        return None
    wanted = {token.strip().lower() for token in str(raw).split(",") if token.strip()}
    groups = [group for group in PEOPLE_INCLUDE_GROUPS if group in wanted]
    if not groups or len(groups) == len(PEOPLE_INCLUDE_GROUPS):
        return None
    return groups


def split_location(location):
    """("city", "country") from "City, Country"; a single part is both."""
    parts = [part.strip() for part in str(location or "").split(",") if part.strip()]
    if not parts:
        return "", ""
    return parts[0], parts[-1]


def city_of(location):
    """City shown on a People card: the first part of their location, or None."""
    city, _ = split_location(location)
    return city[:60] or None


def same_city_q(city):
    return (
        Q(location__iexact=city)
        | Q(location__istartswith=f"{city},")
        | Q(location__istartswith=f"{city} ,")
    )


def same_country_q(country):
    return (
        Q(location__iexact=country)
        | Q(location__iendswith=f", {country}")
        | Q(location__iendswith=f",{country}")
    )


def section_q(section, include):
    """Filter on the ``teaches_me``/``learns_mine`` annotations (0/1)."""
    if section == "perfect":
        return Q(teaches_me=1, learns_mine=1)
    groups = include or PEOPLE_INCLUDE_GROUPS
    q = Q(pk__in=[])
    if "native" in groups:
        q |= Q(teaches_me=1, learns_mine=0)
    if "learners" in groups:
        q |= Q(teaches_me=0, learns_mine=1)
    if "rest" in groups:
        q |= Q(teaches_me=0, learns_mine=0)
    return q


def _key_variants(language):
    return {language, language.capitalize(), language.title()}


def _value_variants(levels):
    return sorted({variant for level in levels for variant in (level, level.capitalize())})


def their_level_q(languages, levels, language_pattern):
    """They practise one of ``languages`` at one of ``levels`` (keys and values
    matched in lowercase / Capitalised / Title form; see data-model)."""
    q = Q(pk__in=[])
    values = _value_variants(levels)
    for language in languages:
        if not language_pattern.fullmatch(language):
            continue
        for key in _key_variants(language):
            q |= Q(**{f"practice_language_levels__{key}__in": values})
    return q


def level_filter_levels(level_filter):
    if level_filter == "advanced_plus":
        return ["advanced", "fluent"]
    return [level_filter] if level_filter in LEVEL_ORDER else []


def nearby_levels(level):
    index = LEVEL_ORDER.index(level)
    return LEVEL_ORDER[max(0, index - 1) : index + 2]


def viewer_levels(user):
    """{language: level} for the viewer, keys and values lowercased."""
    raw = getattr(user, "practice_language_levels", None) or {}
    levels = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(key, str):
                levels.setdefault(key.strip().lower(), str(value or "").strip().lower())
    return levels


def my_level_q(my_learning, my_levels, spoken_languages, language_pattern):
    """The "Your level" filter, or None when the viewer has no usable level."""
    q = Q(pk__in=[])
    usable = False
    for language in my_learning:
        level = my_levels.get(language)
        if level not in LEVEL_ORDER:
            continue
        usable = True
        q |= (Q(native_language__iexact=language) | Q(teaches_me=0)) & their_level_q(
            spoken_languages, nearby_levels(level), language_pattern
        )
    return q if usable else None


def active_label(profile, now):
    """Coarse activity for People cards; never the exact last_seen."""
    last_seen = profile.last_seen
    if profile.is_online or (last_seen and last_seen >= now - ACTIVE_TODAY_WINDOW):
        return "Active today"
    if last_seen and last_seen >= now - ACTIVE_WEEK_WINDOW:
        return "Active this week"
    return None


def is_new_member(profile, now):
    joined = getattr(profile, "date_joined", None)
    return bool(joined and joined >= now - NEW_MEMBER_WINDOW)
