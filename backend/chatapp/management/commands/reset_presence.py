from django.core.management.base import BaseCommand
from django.db.models import Q

from chatapp.models import Profile


class Command(BaseCommand):
    help = (
        "Clear websocket presence counters (ws_connection_count=0, is_online=False). "
        "Run while no websocket server is serving traffic, e.g. in the deploy "
        "release phase, so counts left behind by crashed/restarted processes "
        "do not keep users showing as online."
    )

    def handle(self, *args, **options):
        updated = (
            Profile.objects.filter(Q(is_online=True) | Q(ws_connection_count__gt=0))
            .update(ws_connection_count=0, is_online=False)
        )
        self.stdout.write(self.style.SUCCESS(f"Reset presence for {updated} profile(s)."))
