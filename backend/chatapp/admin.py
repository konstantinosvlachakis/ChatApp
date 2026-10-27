from django.contrib import admin

from .models import PushDevice


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    # The token is a device credential: list the device, not its token.
    list_display = ("id", "user", "platform", "is_active", "last_seen_at", "created_at")
    list_filter = ("platform", "is_active")
    exclude = ("token",)
