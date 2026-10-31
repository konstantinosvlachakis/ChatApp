"""Security headers Django has no setting for: Permissions-Policy and CSP.

The CSP is only attached to HTML responses (the React app and its prerendered
pages); JSON API responses don't need one. It is report-only unless
``CSP_MODE=enforce`` (see settings).
"""

from django.conf import settings


def build_content_security_policy():
    connect_src = ["'self'", "https://api.bigdatacloud.net", *settings.CSP_EXTRA_CONNECT_SRC]
    img_src = [
        "'self'",
        "data:",
        "blob:",
        "https://res.cloudinary.com",
        "https://flagcdn.com",
        "https://randomuser.me",
        *settings.CSP_EXTRA_IMG_SRC,
    ]
    directives = {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"],
        # The CRA build inlines its runtime chunk and index.html has an onload
        # handler on the font stylesheet link.
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
        "img-src": img_src,
        "media-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        # 'self' covers same-origin ws:/wss: in CSP3 browsers.
        "connect-src": connect_src,
        "worker-src": ["'self'", "blob:"],
        "manifest-src": ["'self'"],
    }
    return "; ".join(f"{name} {' '.join(values)}" for name, values in directives.items())


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.permissions_policy = getattr(settings, "PERMISSIONS_POLICY", "")
        mode = getattr(settings, "CSP_MODE", "report-only")
        self.csp_header = {
            "enforce": "Content-Security-Policy",
            "report-only": "Content-Security-Policy-Report-Only",
        }.get(mode)
        self.csp_value = build_content_security_policy() if self.csp_header else ""

    def __call__(self, request):
        response = self.get_response(request)
        if self.permissions_policy and "Permissions-Policy" not in response:
            response["Permissions-Policy"] = self.permissions_policy
        content_type = response.get("Content-Type", "")
        if self.csp_header and content_type.startswith("text/html") and self.csp_header not in response:
            response[self.csp_header] = self.csp_value
        return response
