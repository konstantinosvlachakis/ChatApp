# Generated by Django 4.2.16 on 2024-11-03 10:24

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chatapp', '0004_user_last_login_alter_user_username'),
    ]

    operations = [
        migrations.RenameField(
            model_name='user',
            old_name='nativeLanguage',
            new_name='native_language',
        ),
        migrations.AlterField(
            model_name='user',
            name='password',
            field=models.CharField(max_length=128, verbose_name='password'),
        ),
    ]