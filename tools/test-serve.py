"""Check the development server's actual HTTP headers and unmodified module bytes."""
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
import runpy
from threading import Thread
import unittest

root = Path(__file__).resolve().parents[1]
Handler = runpy.run_path(str(root / 'tools/serve.py'))['Handler']


class ServerTest(unittest.TestCase):
    def test_files_and_errors_cannot_retain_stale_modules(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
        thread = Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            for method, path, status in [('GET', '/web/surfaces.js', 200), ('HEAD', '/', 200), ('GET', '/missing-module.js', 404)]:
                connection = HTTPConnection(*server.server_address)
                connection.request(method, path); response = connection.getresponse()
                self.assertEqual(response.status, status)
                self.assertEqual(response.getheader('Cache-Control'), 'no-store')
                body = response.read()
                if path == '/web/surfaces.js': self.assertEqual(body, (root / 'web/surfaces.js').read_bytes())
                connection.close()
        finally:
            server.shutdown(); thread.join(); server.server_close()


if __name__ == '__main__':
    unittest.main()
