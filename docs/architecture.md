# ChatApp Architecture (Heroku)

```mermaid
flowchart LR
    U[Web User Browser]
    M[Mobile App]

    subgraph Heroku["Heroku App: langvoyage"]
      W[Web Dyno: Daphne ASGI]
      DJ[Django + DRF + Channels]
      ST[Whitenoise Static Files]
    end

    subgraph Addons["Heroku Add-ons"]
      PG[(Heroku Postgres)]
      R[(Redis Cloud)]
      C[(Cloudinary)]
    end

    U -->|HTTPS| W
    M -->|HTTPS| W
    U -->|WSS WebSocket| W
    M -->|WSS WebSocket| W

    W --> DJ
    DJ --> ST

    DJ -->|ORM / Auth / App Data| PG
    DJ -->|Channels Layer + Cache + Presence| R
    DJ -->|Image / Media Uploads| C

    C -->|CDN Media URLs| U
    C -->|CDN Media URLs| M
```

## Notes

- `Procfile` runs Daphne for HTTP + WebSocket traffic.
- Postgres is the primary persistent database.
- Redis Cloud backs Channels real-time coordination and cache.
- Cloudinary stores media off dyno filesystem.
