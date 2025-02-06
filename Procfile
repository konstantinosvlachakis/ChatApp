web: cd frontend && npm install && npm run build && daphne -b 0.0.0.0 -p ${PORT} backend.core.asgi:application
release: python backend/manage.py migrate
