"""Local visual-only specimen. Whitelisted assets; no auth, POST, or file listing.
Run from repository root: python docs/design/serve-specimen.py
Requires the existing Next build for its generated Latin Manrope font.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
font = None
for css in (ROOT / '.next/static/chunks').glob('*.css'):
    for block in css.read_text(encoding='utf-8').split('}'):
        if 'font-family:Manrope;' in block and 'U+??,' in block:
            match = re.search(r'url\(\.\./media/([^)]*)\)', block)
            if match:
                font = ROOT / '.next/static/media' / match.group(1)
if font is None or not font.is_file():
    raise SystemExit('Build-generated Latin Manrope font unavailable; run the documented legacy build first.')
ASSETS = {
    '/': (ROOT / 'docs/design/auth-specimen.html', 'text/html; charset=utf-8'),
    '/font.woff2': (font, 'font/woff2'),
    '/logo.png': (ROOT / 'app/assets/images/logos/mhistree_black_logo.png', 'image/png'),
}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        item = ASSETS.get(self.path)
        if item is None:
            self.send_error(404)
            return
        path, content_type = item
        data = path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

if __name__ == '__main__':
    print('Visual specimen only: http://127.0.0.1:3102', flush=True)
    HTTPServer(('127.0.0.1', 3102), Handler).serve_forever()
