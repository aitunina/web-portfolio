"""Run after scripts/build.py --output dist; no browser or private files needed."""
import importlib.util
import json
import re
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path
from urllib.parse import unquote, urlsplit, parse_qs
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
spec = importlib.util.spec_from_file_location('builder', ROOT / 'scripts/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ReleaseChecks(unittest.TestCase):
    def check_url(self, url, base=DIST):
        parts = urlsplit(url)
        file = base / unquote(parts.path)
        self.assertTrue(file.is_file(), url)
        self.assertEqual(parse_qs(parts.query).get('v'), [sha256(file.read_bytes()).hexdigest()[:16]], url)
        return file

    def test_manifest_matches_folders_and_js(self):
        data = json.loads((DIST / 'portfolio.json').read_text())
        source = builder.scan()
        self.assertEqual([p['title'] for p in data['projects']], [name for name, _ in source])
        for project, (_, files) in zip(data['projects'], source):
            self.assertEqual([self.check_url(url).relative_to(DIST) for url in project['slides']],
                             [file.relative_to(ROOT) for file in files])
        self.assertEqual(self.check_url(data['pdf']).read_bytes()[:5], b'%PDF-')
        js = (DIST / 'assets/portfolio-data.js').read_text()
        self.assertEqual(json.loads(js.split(' = ', 1)[1].removesuffix(';\n')), data)

    def test_all_entry_resources_are_versioned(self):
        html = (DIST / 'index.html').read_text()
        for url in re.findall(r'(?:src|href|data-portfolio-src)="([^"]+)"', html):
            if not urlsplit(url).scheme and not url.startswith('#'):
                self.check_url(url)
        css = (DIST / 'assets/styles.css').read_text()
        for url in re.findall(r"url\('([^']+)'\)", css):
            self.check_url(url, DIST / 'assets')

    def test_cache_version_changes_only_with_content(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            file = base / 'image with space.png'
            file.write_bytes(b'first image')
            old = builder.versioned(file, base)
            file.touch()
            self.assertEqual(old, builder.versioned(file, base))
            file.write_bytes(b'new image at the same filename')
            self.assertNotEqual(old, builder.versioned(file, base))
            html = '<img src="image%20with%20space.png"><a href="#top">Top</a><a href="https://example.com">External</a>'
            result = builder.version_references(html, base)
            self.assertIn(builder.versioned(file, base), result)
            self.assertIn('href="#top"', result)
            self.assertIn('href="https://example.com"', result)
            self.assertEqual(result, builder.version_references(result, base))

    def test_no_private_sources_in_deployment(self):
        allowed = {'assets', 'portfolio', 'downloads'}
        self.assertEqual({p.name for p in DIST.iterdir() if p.is_dir()}, allowed)
        self.assertFalse(any(p.suffix.lower() in {'.pptx', '.py'} for p in DIST.rglob('*')))
        self.assertFalse((DIST / 'assets/portrait-original.png').exists())

    def test_portrait_keeps_source_resolution_alpha_and_face(self):
        with Image.open(ROOT / 'assets/portrait-original.png') as original, Image.open(ROOT / 'assets/portrait-pistachio.png') as portrait:
            self.assertEqual(portrait.format, 'PNG')
            self.assertEqual(portrait.mode, 'RGBA')
            self.assertEqual(portrait.size, original.size)
            self.assertGreaterEqual(portrait.height, 1280)
            self.assertEqual(portrait.getchannel('A').tobytes(), original.getchannel('A').tobytes())
            self.assertEqual(portrait.getchannel('A').getextrema(), (0, 255))
            # The upper face/hair region is outside the authorized fabric recoloring.
            box = (0, 0, portrait.width, 480)
            self.assertEqual(portrait.crop(box).tobytes(), original.crop(box).tobytes())
            self.assertIsNotNone(ImageChops.difference(portrait.convert('RGB'), original.convert('RGB')).getbbox())
        self.assertEqual((DIST / 'assets/portrait-pistachio.png').read_bytes(),
                         (ROOT / 'assets/portrait-pistachio.png').read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
