from django.core.management.base import BaseCommand

from chatapp.demo_profiles import LANGUAGES, seed_demo_profiles


class Command(BaseCommand):
    help = "Create labelled, non-login demo profiles for People without changing chats or existing users."

    def add_arguments(self, parser):
        parser.add_argument("--per-language", type=int, default=8, choices=range(5, 11))
        parser.add_argument("--dry-run", action="store_true", help="Show counts without writing anything.")

    def handle(self, *args, **options):
        result = seed_demo_profiles(options["per_language"], dry_run=options["dry_run"])
        verb = "Would create" if options["dry_run"] else "Created"
        count = result["would_create"] if options["dry_run"] else result["created"]
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {count} demo profiles; {result['existing']} already present. "
            f"{result['per_language']} each: {', '.join(LANGUAGES)}."
        ))
