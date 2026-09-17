#!/usr/bin/env python3
"""Serve only public application assets, never private workbooks or Git metadata."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import os
PUBLIC = {'/index.html','/app.js','/app.css','/workflow-core.js','/workflow-store.js','/config.js','/demo-data.js'}
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/': self.path = '/index.html'
        elif path not in PUBLIC:
            self.send_error(404)
            return
        super().do_GET()
    def do_HEAD(self):
        if urlsplit(self.path).path not in PUBLIC | {'/'}:
            self.send_error(404)
            return
        super().do_HEAD()
if __name__ == '__main__':
    os.chdir(Path(__file__).resolve().parents[1])
    ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
