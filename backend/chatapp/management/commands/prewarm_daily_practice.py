from django.core.management.base import BaseCommand

from chatapp.views import get_or_build_daily_library, practice_bucket_for_level


DEFAULT_LANGUAGES = ("english", "spanish", "french", "greek", "russian")
DEFAULT_LEVELS = (1, 3, 5)


class Command(BaseCommand):
    help = (
        "Prewarm the shared daily practice library for the treasure hunt. "
        "Defaults to A1/A2/B1-equivalent levels with 10 items each."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--languages",
            nargs="+",
            default=list(DEFAULT_LANGUAGES),
            help="Languages to prewarm, e.g. english spanish french",
        )
        parser.add_argument(
            "--levels",
            nargs="+",
            type=int,
            default=list(DEFAULT_LEVELS),
            help="Internal levels to prewarm. Defaults map to A1/A2/B1 buckets.",
        )
        parser.add_argument(
            "--count",
            type=int,
            default=10,
            help="Target number of daily items to have ready per language/level.",
        )

    def handle(self, *args, **options):
        languages = [str(language).strip().lower() for language in options["languages"] if str(language).strip()]
        levels = [int(level) for level in options["levels"]]
        count = max(1, int(options["count"]))

        for language in languages:
            for level in levels:
                bucket = practice_bucket_for_level(level)
                pool = get_or_build_daily_library(
                    language=language,
                    level=level,
                    bucket=bucket,
                    target_size=count,
                    min_ready=count,
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{language} level={level} bucket={bucket}: {len(pool)} items ready"
                    )
                )
