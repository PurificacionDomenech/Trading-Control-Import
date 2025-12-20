
import http.server
import socketserver
import os
import mimetypes

PORT = 5000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def guess_type(self, path):
        """Override para asegurar tipos MIME correctos"""
        mimetype, encoding = mimetypes.guess_type(path)
        
        # Asegurar tipos correctos para archivos específicos
        if path.endswith('.js'):
            mimetype = 'application/javascript'
        elif path.endswith('.css'):
            mimetype = 'text/css'
        elif path.endswith('.html'):
            mimetype = 'text/html'
        elif path.endswith('.json'):
            mimetype = 'application/json'
        elif path.endswith('.png'):
            mimetype = 'image/png'
        elif path.endswith('.jpg') or path.endswith('.jpeg'):
            mimetype = 'image/jpeg'
        elif path.endswith('.mp4'):
            mimetype = 'video/mp4'
            
        return mimetype, encoding

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")

# Cambiar al directorio del script
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Configurar servidor
Handler = MyHTTPRequestHandler
Handler.extensions_map.update({
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
})

print(f"Sirviendo archivos desde: {os.getcwd()}")
print(f"Servidor iniciado en http://0.0.0.0:{PORT}")

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido")
        httpd.shutdown()
