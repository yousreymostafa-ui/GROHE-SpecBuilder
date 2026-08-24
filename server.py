import base64
import io
import json
import mimetypes
import os
import re
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs, quote

import image_recovery as IR

try:
    from PIL import Image, ImageOps
except Exception:
    Image = None
    ImageOps = None

HOST = '127.0.0.1'
PORT = 8765
APP_DIR = Path(__file__).resolve().parent
CONFIG_FILE = APP_DIR / 'grohe_selector_config.json'
DEFAULT_IMAGE_ROOT = Path(os.environ.get('GROHE_IMAGES_DIR', r'G:\My Drive\Images'))
DEFAULT_PDF_ROOT = Path(os.environ.get('GROHE_PDFS_DIR', r'G:\My Drive\Data Sheets'))
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}
PDF_EXTS = {'.pdf'}
THUMB_DIR = APP_DIR / '.thumb_cache'
THUMB_SIZE = (260, 260)


def save_image_bytes_as_jpeg(sku, raw, target_root=None):
    if Image is None:
        raise RuntimeError('Pillow is required to save JPEG images')
    sku=normalize_sku(sku)
    if not sku:
        raise ValueError('SKU is required')
    if not raw or len(raw)>25*1024*1024:
        raise ValueError('Image is empty or larger than 25 MB')
    root=Path(target_root) if target_root is not None else IMAGE_ROOT
    root.mkdir(parents=True,exist_ok=True)
    target=root/f'{sku}.jpg'
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im=ImageOps.exif_transpose(im) if ImageOps is not None else im
            if im.mode in ('RGBA','LA') or (im.mode=='P' and 'transparency' in im.info):
                rgba=im.convert('RGBA')
                canvas=Image.new('RGB',rgba.size,'white')
                canvas.paste(rgba,mask=rgba.getchannel('A'))
                out=canvas
            else:
                out=im.convert('RGB')
            max_side=4000
            if max(out.size)>max_side:
                ratio=max_side/max(out.size)
                size=(max(1,int(out.size[0]*ratio)),max(1,int(out.size[1]*ratio)))
                out=out.resize(size,Image.Resampling.LANCZOS)
            out.save(target,'JPEG',quality=94,optimize=True,progressive=True)
    except Exception as exc:
        raise ValueError(f'Could not decode image: {exc}') from exc
    return target


def import_image_to_jpeg(sku, *, data_url='', url='', target_root=None):
    raw=b''
    source=''
    if data_url:
        text=str(data_url)
        m=re.match(r'^data:image/[^;]+;base64,(.+)$',text,re.I|re.S)
        if not m:
            raise ValueError('Pasted data is not a supported image')
        try:
            raw=base64.b64decode(m.group(1),validate=False)
        except Exception as exc:
            raise ValueError('Could not decode pasted image') from exc
        source='pasted / local image'
    elif url:
        value=str(url).strip()
        parsed=urlparse(value)
        if parsed.scheme not in ('http','https') or not parsed.netloc:
            raise ValueError('Image URL must start with http:// or https://')
        status,headers,body=IR.request_url(value,timeout=30,head=False,max_bytes=25*1024*1024)
        if not (200<=status<400) or not body:
            raise ValueError(headers.get('x-error') or f'Image URL returned HTTP {status or 0}')
        if not IR.looks_like_image(headers,body[:64],value):
            raise ValueError('The URL did not return an image')
        raw=body
        source=value
    else:
        raise ValueError('Paste, choose, or provide an image URL first')
    path=save_image_bytes_as_jpeg(sku,raw,target_root=target_root)
    return path,source


def normalize_sku(value: str) -> str:
    return re.sub(r'[^A-Za-z0-9]', '', str(value)).upper()


def load_config():
    try:
        if CONFIG_FILE.exists():
            data = json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def save_config(data):
    try:
        CONFIG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    except Exception as exc:
        print(f'Warning: could not save config: {exc}')


def configured_image_root():
    env = os.environ.get('GROHE_IMAGES_DIR')
    if env:
        return Path(env)
    cfg = load_config()
    saved = str(cfg.get('image_root') or '').strip()
    return Path(saved) if saved else DEFAULT_IMAGE_ROOT


def configured_pdf_root():
    env = os.environ.get('GROHE_PDFS_DIR')
    if env:
        return Path(env)
    cfg = load_config()
    saved = str(cfg.get('pdf_root') or '').strip()
    return Path(saved) if saved else DEFAULT_PDF_ROOT


class ImageIndex:
    def __init__(self, root: Path):
        self.root = root
        self.items = {}
        self.scan()

    def scan(self):
        items = {}
        if self.root.exists():
            for base, _, files in os.walk(self.root):
                for name in files:
                    path = Path(base) / name
                    if path.suffix.lower() not in IMAGE_EXTS:
                        continue
                    sku = normalize_sku(path.stem)
                    if sku and sku not in items:
                        items[sku] = path
        self.items = items
        return len(items)

    def get(self, sku: str):
        return self.items.get(normalize_sku(sku))

    def version(self, sku: str):
        path = self.get(sku)
        if not path or not path.exists():
            return ''
        try:
            stat = path.stat()
            return f'{stat.st_mtime_ns:x}-{stat.st_size:x}'
        except OSError:
            return ''

    def versions(self):
        return {sku: self.version(sku) for sku in self.items}


class PdfIndex:
    """Fast, deterministic index for local GROHE PDF data sheets.

    Earlier builds accidentally nested the filename loop, causing O(n²) indexing
    inside each folder. A large Google Drive data-sheet folder could therefore
    make product-card PDF previews appear to hang.
    """
    def __init__(self, root: Path):
        self.root = root
        self.files = []
        self.by_stem = {}
        self._normalized = []
        self.scan()

    def scan(self):
        files = []
        by_stem = {}
        normalized = []
        if self.root.exists():
            for base, _, names in os.walk(self.root):
                for name in names:
                    path = Path(base) / name
                    if path.suffix.lower() not in PDF_EXTS:
                        continue
                    key = normalize_sku(path.stem)
                    files.append(path)
                    normalized.append((key, path))
                    if key and key not in by_stem:
                        by_stem[key] = path
        files.sort(key=lambda x: str(x).lower())
        normalized.sort(key=lambda x: (x[0], str(x[1]).lower()))
        self.files = files
        self.by_stem = by_stem
        self._normalized = normalized
        return len(files)

    def find(self, sku: str):
        sku = normalize_sku(sku)
        if not sku:
            return None
        exact = self.by_stem.get(sku)
        if exact and exact.exists():
            return exact
        # GROHE files are often named "<SKU> description.pdf" rather than
        # exactly "<SKU>.pdf". Prefer a filename beginning with the SKU, then
        # fall back to a contained match.
        candidates = []
        for stem, path in self._normalized:
            if not path.exists():
                continue
            if stem.startswith(sku):
                rank = 0
            elif sku in stem:
                rank = 1
            else:
                continue
            candidates.append((rank, abs(len(stem) - len(sku)), len(path.name), str(path).lower(), path))
        if candidates:
            candidates.sort(key=lambda x: x[:-1])
            return candidates[0][-1]
        return None

    def file_state(self, sku: str):
        path = self.find(sku)
        if not path or not path.exists():
            return {'found': False, 'readable': False, 'size': 0, 'signature': False, 'path': None}
        try:
            size = path.stat().st_size
            with path.open('rb') as fh:
                head = fh.read(8)
            return {
                'found': True,
                'readable': True,
                'size': size,
                'signature': head.startswith(b'%PDF-'),
                'path': path,
            }
        except OSError:
            return {'found': True, 'readable': False, 'size': 0, 'signature': False, 'path': path}


IMAGE_ROOT = configured_image_root()
INDEX = ImageIndex(IMAGE_ROOT)
PDF_ROOT = configured_pdf_root()
PDF_INDEX = PdfIndex(PDF_ROOT)

def set_image_root(path_value):
    global IMAGE_ROOT
    IMAGE_ROOT = Path(path_value)
    INDEX.root = IMAGE_ROOT
    count = INDEX.scan()
    cfg = load_config()
    cfg['image_root'] = str(IMAGE_ROOT)
    cfg['image_folder'] = str(IMAGE_ROOT)
    save_config(cfg)
    try:
        IR.set_image_folder(IMAGE_ROOT)
    except Exception:
        pass
    return count


def set_pdf_root(path_value):
    global PDF_ROOT
    PDF_ROOT=Path(path_value); PDF_INDEX.root=PDF_ROOT; count=PDF_INDEX.scan()
    cfg=load_config(); cfg['pdf_root']=str(PDF_ROOT); save_config(cfg); return count


def thumbnail_for(path: Path, sku: str):
    if Image is None:
        return path, mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    try:
        THUMB_DIR.mkdir(exist_ok=True)
        stat = path.stat()
        stamp = f'{stat.st_mtime_ns:x}-{stat.st_size:x}'
        target = THUMB_DIR / f'{normalize_sku(sku)}_{stamp}.jpg'
        if not target.exists():
            # Remove stale cached revisions for this SKU.
            for old in THUMB_DIR.glob(f'{normalize_sku(sku)}_*.jpg'):
                try:
                    old.unlink()
                except OSError:
                    pass
            with Image.open(path) as im:
                if ImageOps:
                    im = ImageOps.exif_transpose(im)
                im.thumbnail(THUMB_SIZE, Image.Resampling.LANCZOS)
                canvas = Image.new('RGB', THUMB_SIZE, 'white')
                if im.mode in ('RGBA', 'LA'):
                    rgba = im.convert('RGBA')
                    pos = ((THUMB_SIZE[0]-rgba.width)//2, (THUMB_SIZE[1]-rgba.height)//2)
                    canvas.paste(rgba, pos, rgba)
                else:
                    rgb = im.convert('RGB')
                    pos = ((THUMB_SIZE[0]-rgb.width)//2, (THUMB_SIZE[1]-rgb.height)//2)
                    canvas.paste(rgb, pos)
                canvas.save(target, 'JPEG', quality=82, optimize=True)
        return target, 'image/jpeg'
    except Exception:
        return path, mimetypes.guess_type(str(path))[0] or 'application/octet-stream'


def warm_thumbnail_cache(items=None):
    """Build persistent thumbnails in the background without delaying app startup."""
    if Image is None:
        return
    snapshot = list((items or INDEX.items).items()) if isinstance(items or INDEX.items, dict) else list(items or [])
    made = 0
    for sku, path in snapshot:
        try:
            thumbnail_for(path, sku)
            made += 1
        except Exception:
            pass
    if made:
        print(f'Thumbnail cache ready for {made:,} images.')


def start_thumbnail_warmup():
    threading.Thread(target=warm_thumbnail_cache, name='grohe-thumb-cache', daemon=True).start()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, fmt, *args):
        # Keep the launcher window clean unless there is an error.
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)

    def _json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0') or 0)
            raw = self.rfile.read(length) if length else b'{}'
            data = json.loads(raw.decode('utf-8'))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _send_pdf(self, path, head_only=False):
        try:
            size = path.stat().st_size
        except OSError:
            return self.send_error(500, 'Could not read PDF')
        start, end = 0, max(0, size - 1)
        status = 200
        range_header = self.headers.get('Range', '')
        if range_header:
            m = re.match(r'bytes=(\d*)-(\d*)$', range_header.strip())
            if m:
                a, b = m.groups()
                try:
                    if a:
                        start = int(a)
                        end = int(b) if b else end
                    elif b:
                        suffix = int(b)
                        start = max(0, size - suffix)
                    if start < 0 or start >= size or end < start:
                        self.send_response(416)
                        self.send_header('Content-Range', f'bytes */{size}')
                        self.end_headers()
                        return
                    end = min(end, size - 1)
                    status = 206
                except ValueError:
                    pass
        length = max(0, end - start + 1)
        self.send_response(status)
        self.send_header('Content-Type', 'application/pdf')
        self.send_header('Accept-Ranges', 'bytes')
        # Keep the preview response deliberately simple. Some Chromium PDF
        # viewers are sensitive to complex Content-Disposition filename headers.
        # A download route can still provide a filename, but inline preview only
        # needs the MIME type and byte-range support.
        disposition = getattr(self, '_pdf_disposition', 'inline')
        if disposition == 'attachment':
            safe_ascii = re.sub(r'[^A-Za-z0-9._ -]+', '_', path.name).replace('"', '').strip() or 'datasheet.pdf'
            utf8_name = quote(path.name, safe='')
            self.send_header('Content-Disposition', f"attachment; filename=\"{safe_ascii}\"; filename*=UTF-8''{utf8_name}")
        else:
            self.send_header('Content-Disposition', 'inline')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(length))
        self.end_headers()
        if head_only or length <= 0:
            return
        try:
            with path.open('rb') as fh:
                fh.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = fh.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (OSError, BrokenPipeError, ConnectionResetError):
            return

    def do_HEAD(self):
        parsed = urlparse(self.path)
        route = parsed.path
        qs = parse_qs(parsed.query)
        if route == '/api/pdfs/file':
            sku = normalize_sku((qs.get('sku') or [''])[0])
            path = PDF_INDEX.find(sku)
            if not path or not path.exists():
                return self.send_error(404, 'PDF not found')
            self._pdf_disposition = 'attachment' if (qs.get('download') or ['0'])[0] == '1' else 'inline'
            return self._send_pdf(path, head_only=True)
        return super().do_HEAD()

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        qs = parse_qs(parsed.query)
        if route == '/api/health':
            return self._json({
                'ok': True,
                'port': PORT,
                'image_folder': str(IMAGE_ROOT),
                'folder_exists': IMAGE_ROOT.exists(),
                'image_count': len(INDEX.items),
                'integrated_image_recovery': True,
                'pdf_folder': str(PDF_ROOT),
                'pdf_folder_exists': PDF_ROOT.exists(),
                'pdf_count': len(PDF_INDEX.files),
            })
        if route == '/api/pdfs':
            return self._json({'connected':PDF_ROOT.exists(),'path':str(PDF_ROOT),'count':len(PDF_INDEX.files)})
        if route == '/api/pdfs/match':
            sku=normalize_sku((qs.get('sku') or [''])[0])
            info=PDF_INDEX.file_state(sku); path=info.get('path')
            version=''
            if path and info.get('readable'):
                try:
                    st=path.stat(); version=f'{st.st_mtime_ns:x}-{st.st_size:x}'
                except OSError:
                    version=''
            return self._json({
                'found':bool(info.get('found')),
                'readable':bool(info.get('readable')),
                'signature':bool(info.get('signature')),
                'size':int(info.get('size') or 0),
                'sku':sku,
                'name':path.name if path else '',
                'relative':str(path.relative_to(PDF_ROOT)) if path and path.exists() else '',
                'url':f'/api/pdfs/file?sku={sku}&v={version}' if path and path.exists() else '',
            })
        if route == '/api/pdfs/file':
            sku = normalize_sku((qs.get('sku') or [''])[0])
            path = PDF_INDEX.find(sku)
            if not path or not path.exists():
                return self.send_error(404, 'PDF not found')
            self._pdf_disposition = 'attachment' if (qs.get('download') or ['0'])[0] == '1' else 'inline'
            return self._send_pdf(path)
        if route == '/api/images/state':
            return self._json({'ok': True, 'state': IR.load_state()})
        if route == '/api/images/local':
            sku = normalize_sku((qs.get('sku') or [''])[0])
            path = INDEX.get(sku)
            if not path or not path.exists():
                return self.send_error(404, 'Image not found')
            try:
                data = path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(data)
            except OSError:
                self.send_error(500, 'Could not read image')
            return
        if route == '/api/images/preview':
            sku = normalize_sku((qs.get('sku') or [''])[0])
            item = IR.load_state().get(sku, {})
            url = item.get('source_url', '') if isinstance(item, dict) else ''
            if not url or not IR.official_url(url):
                return self.send_error(404, 'No approved preview')
            status, headers, body = IR.request_url(url, timeout=20, head=False)
            if not (200 <= status < 400) or not body:
                return self.send_error(404, 'Preview unavailable')
            self.send_response(200)
            self.send_header('Content-Type', headers.get('content-type', 'image/jpeg'))
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == '/api/images':
            return self._json({
                'connected': IMAGE_ROOT.exists(),
                'path': str(IMAGE_ROOT),
                'count': len(INDEX.items),
                'skus': list(INDEX.items.keys()),
                'versions': INDEX.versions(),
                'thumbnail_cache': str(THUMB_DIR),
            })
        if self.path.startswith('/images/') or self.path.startswith('/thumbs/'):
            is_thumb = self.path.startswith('/thumbs/')
            prefix = '/thumbs/' if is_thumb else '/images/'
            sku = unquote(self.path[len(prefix):].split('?', 1)[0])
            path = INDEX.get(sku)
            if not path or not path.exists():
                return self.send_error(404, 'Image not found')
            try:
                serve_path, ctype = thumbnail_for(path, sku) if is_thumb else (path, mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
                data = serve_path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if is_thumb and parsed.query else 'public, max-age=86400')
                self.end_headers()
                self.wfile.write(data)
            except OSError:
                self.send_error(500, 'Could not read image')
            return
        return super().do_GET()

    def do_POST(self):
        route = urlparse(self.path).path
        if route == '/api/pdfs/set-folder':
            data=self._read_json(); folder=str(data.get('folder','')).strip()
            if not folder: return self._json({'ok':False,'error':'Folder path is required'},400)
            try:
                count=set_pdf_root(folder); return self._json({'ok':True,'pdf_folder':str(PDF_ROOT),'folder_exists':PDF_ROOT.exists(),'count':count})
            except Exception as exc: return self._json({'ok':False,'error':str(exc)},500)
        if route == '/api/rescan-pdfs':
            count=PDF_INDEX.scan(); return self._json({'connected':PDF_ROOT.exists(),'path':str(PDF_ROOT),'count':count})
        if route == '/api/select-pdf-folder':
            try:
                import tkinter as tk
                from tkinter import filedialog
                root=tk.Tk(); root.withdraw()
                try: root.attributes('-topmost',True)
                except Exception: pass
                initial=str(PDF_ROOT if PDF_ROOT.exists() else Path.home()); selected=filedialog.askdirectory(title='Select GROHE data sheets folder',initialdir=initial); root.destroy()
                if not selected: return self._json({'cancelled':True,'connected':PDF_ROOT.exists(),'path':str(PDF_ROOT),'count':len(PDF_INDEX.files)})
                count=set_pdf_root(selected); return self._json({'connected':PDF_ROOT.exists(),'path':str(PDF_ROOT),'count':count,'saved':True})
            except Exception as exc: return self._json({'connected':False,'error':str(exc),'nativePickerUnavailable':True},500)
        if route == '/api/images/import-jpeg':
            data=self._read_json(); sku=normalize_sku(data.get('sku',''))
            if not sku: return self._json({'ok':False,'error':'SKU is required'},400)
            try:
                path,source=import_image_to_jpeg(sku,data_url=str(data.get('data_url') or ''),url=str(data.get('url') or ''))
                INDEX.scan()
                indexed=INDEX.get(sku)
                if indexed: threading.Thread(target=lambda: thumbnail_for(indexed,sku),daemon=True).start()
                IR.update_state(sku,{'status':'local','local_file':str(path),'confidence':100,'source':'Manual Google image recovery','source_url':source if source.startswith(('http://','https://')) else '','last_error':''})
                return self._json({'ok':True,'sku':sku,'filename':path.name,'path':str(path),'image_count':len(INDEX.items),'version':INDEX.version(sku)})
            except Exception as exc:
                return self._json({'ok':False,'error':str(exc)},400)
        if route == '/api/images/scan':
            data = self._read_json()
            skus = [normalize_sku(x) for x in data.get('skus', []) if normalize_sku(x)]
            return self._json(IR.scan_products(skus, INDEX.items))
        if route == '/api/images/find':
            data = self._read_json()
            sku = normalize_sku(data.get('sku', ''))
            if not sku:
                return self._json({'ok': False, 'error': 'SKU is required'}, 400)
            try:
                return self._json({'ok': True, 'item': IR.find_candidate(sku)})
            except Exception as exc:
                return self._json({'ok': False, 'error': str(exc)}, 500)
        if route == '/api/images/download':
            data = self._read_json()
            sku = normalize_sku(data.get('sku', ''))
            if not sku:
                return self._json({'ok': False, 'error': 'SKU is required'}, 400)
            try:
                item = IR.download_candidate(sku, data.get('url'))
                INDEX.scan()
                path = INDEX.get(sku)
                if path:
                    threading.Thread(target=lambda: thumbnail_for(path, sku), daemon=True).start()
                return self._json({'ok': True, 'item': item, 'image_count': len(INDEX.items), 'version': INDEX.version(sku)})
            except Exception as exc:
                return self._json({'ok': False, 'error': str(exc)}, 500)
        if route == '/api/images/set-folder':
            data = self._read_json()
            folder = str(data.get('folder', '')).strip()
            if not folder:
                return self._json({'ok': False, 'error': 'Folder path is required'}, 400)
            try:
                count = set_image_root(folder)
                IR.set_image_folder(folder)
                start_thumbnail_warmup()
                return self._json({'ok': True, 'image_folder': str(IMAGE_ROOT), 'folder_exists': IMAGE_ROOT.exists(), 'count': count, 'versions': INDEX.versions()})
            except Exception as exc:
                return self._json({'ok': False, 'error': str(exc)}, 500)
        if self.path == '/api/rescan-images':
            count = INDEX.scan()
            start_thumbnail_warmup()
            return self._json({'connected': IMAGE_ROOT.exists(), 'path': str(IMAGE_ROOT), 'count': count, 'skus': list(INDEX.items.keys()), 'versions': INDEX.versions()})
        if self.path == '/api/select-image-folder':
            # Native Windows folder picker. Unlike a browser directory handle, the
            # selected filesystem path can be saved and reused automatically later.
            try:
                import tkinter as tk
                from tkinter import filedialog
                root = tk.Tk()
                root.withdraw()
                try:
                    root.attributes('-topmost', True)
                except Exception:
                    pass
                initial = str(IMAGE_ROOT if IMAGE_ROOT.exists() else Path.home())
                selected = filedialog.askdirectory(title='Select GROHE product images folder', initialdir=initial)
                root.destroy()
                if not selected:
                    return self._json({'cancelled': True, 'connected': IMAGE_ROOT.exists(), 'path': str(IMAGE_ROOT), 'count': len(INDEX.items), 'skus': list(INDEX.items.keys())})
                count = set_image_root(selected)
                start_thumbnail_warmup()
                return self._json({'connected': IMAGE_ROOT.exists(), 'path': str(IMAGE_ROOT), 'count': count, 'skus': list(INDEX.items.keys()), 'versions': INDEX.versions(), 'saved': True})
            except Exception as exc:
                return self._json({'connected': False, 'error': str(exc), 'nativePickerUnavailable': True}, 500)
        return self.send_error(404)


def open_browser():
    webbrowser.open(f'http://{HOST}:{PORT}/')


if __name__ == '__main__':
    print('GROHE products builder v18.4.6')
    print(f'Images: {IMAGE_ROOT}')
    print(f'Data Sheets: {PDF_ROOT}')
    if IMAGE_ROOT.exists():
        print(f'Indexed {len(INDEX.items):,} image files automatically.')
        start_thumbnail_warmup()
    else:
        print('Image folder not found. Set GROHE_IMAGES_DIR if the path changes.')
    if PDF_ROOT.exists(): print(f'Indexed {len(PDF_INDEX.files):,} PDF data sheets automatically.')
    else: print('Data Sheets folder not found. Set GROHE_PDFS_DIR if the path changes.')
    print(f'Opening http://{HOST}:{PORT}/')
    threading.Timer(0.7, open_browser).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
