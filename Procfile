web: cd frontend && yarn install && yarn build && cd ../backend && daphne -b 0.0.0.0 -p ${PORT} backend.core.asgi:application
release: python backend/manage.py migrate
