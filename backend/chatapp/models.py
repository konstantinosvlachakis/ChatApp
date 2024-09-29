from django.db import models

# Create your models here.


class User(models.Model):
    user_id = models.CharField(primary_key=True, max_length=5)
    username = models.CharField(max_length=30)
    password = models.CharField(
        max_length=128
    )  # 128 is typically used for hashed passwords

    def __str__(self):
        return self.username