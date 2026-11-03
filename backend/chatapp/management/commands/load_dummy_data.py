from django.core.management.base import BaseCommand

from chatapp.demo_profiles import LANGUAGES, MAX_PER_LANGUAGE, seed_demo_profiles


class Command(BaseCommand):
    help = "Create labelled, non-login demo profiles for People without changing chats or existing users."

    def add_arguments(self, parser):
        parser.add_argument("--per-language", type=int, default=MAX_PER_LANGUAGE, choices=range(1, MAX_PER_LANGUAGE + 1))
        parser.add_argument("--dry-run", action="store_true", help="Show counts without writing anything.")
        parser.add_argument("--refresh-photos", action="store_true",
                            help="Also update the portrait URL of demo profiles that already exist.")
        parser.add_argument("--prune", action="store_true",
                            help="Also delete demo profiles that are no longer in the list (and their chats).")

    def handle(self, *args, **options):
        result = seed_demo_profiles(options["per_language"], dry_run=options["dry_run"],
                                    refresh_photos=options["refresh_photos"], prune=options["prune"])
        dry = options["dry_run"]
        created = result["would_create"] if dry else result["created"]
        refreshed = result["would_refresh"] if dry else result["refreshed"]
        pruned = result["would_prune"] if dry else result["pruned"]
        self.stdout.write(self.style.SUCCESS(
            f"{'Would create' if dry else 'Created'} {created} demo profiles; {result['existing']} already present. "
            f"{result['per_language']} each: {', '.join(LANGUAGES)}. "
            f"{'Would refresh' if dry else 'Refreshed'} {refreshed} photos; {'would prune' if dry else 'pruned'} {pruned}."
        ))
