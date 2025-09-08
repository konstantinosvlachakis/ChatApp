release: python backend/manage.py migrate && python backend/manage.py collectstatic --noinput
web: daphne -b 0.0.0.0 -p ${PORT} backend.core.asgi:application
