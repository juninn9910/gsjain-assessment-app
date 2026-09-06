"""app.jsx -> app.js 빌드 서버.

사용법:
  1) 이 폴더의 상위(레포 루트)에서:  python build/build.py
  2) 브라우저에서 http://127.0.0.1:8732/build/build.html 열기
  3) "완료" 뜨면 창 닫고, 터미널에서 Ctrl+C

node/npm 없이 브라우저의 Babel로 JSX를 미리 변환합니다.
소스는 app.jsx 이고, app.js 는 빌드 결과물이니 직접 고치지 마세요.
"""
import http.server, socketserver, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n)
        with open(os.path.join(ROOT, 'app.js'), 'wb') as f:
            f.write(data)
        print('app.js 저장됨: %d bytes' % len(data))
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'saved %d' % len(data))

    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
print('http://127.0.0.1:8732/build/build.html 을 브라우저에서 여세요. (종료: Ctrl+C)')
with socketserver.TCPServer(("127.0.0.1", 8732), H) as httpd:
    httpd.serve_forever()
