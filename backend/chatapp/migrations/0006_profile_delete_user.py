# Generated by Django 4.2.16 on 2024-11-03 16:49

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chatapp', '0005_rename_nativelanguage_user_native_language_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Profile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.CharField(max_length=30, unique=True)),
                ('native_language', models.CharField(max_length=255)),
                ('profile_image_url', models.CharField(blank=True, max_length=255, null=True)),
            ],
        ),
        migrations.DeleteModel(
            name='User',
        ),
    ]