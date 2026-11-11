"""Import explicitly downloaded BnF/OBVIL TEI archives; never extract tar paths.

Usage: python scripts/seed-gallica.py .cache/gallica-bulk/x.tar [...]
Official public dataset: https://api.bnf.fr/fr/documents-de-gallica-produits-au-format-tei-par-obvil
Download the matching .json metadata and .tar through that page's download link.
"""
import gzip, hashlib, json, re, sys, tarfile
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {'t': 'http://www.tei-c.org/ns/1.0'}
records, provenance, excluded = {}, [], []
for arg in sys.argv[1:]:
    path = Path(arg)
    metadata = {}
    for item in json.loads(path.with_suffix('.json').read_text(encoding='utf-8')):
        metadata.update(item)
    provenance.append({'archive': path.name, 'sha256': hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()})
    with tarfile.open(path) as archive:
        for member in archive:
            if not member.isfile() or member.size > 8 * 1024 * 1024 or member.name not in metadata:
                continue
            xml = archive.extractfile(member).read()
            if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml:
                raise ValueError('Unsupported XML declaration')
            try:
                root = ET.fromstring(xml)
            except ET.ParseError:
                excluded.append({'archive': path.name, 'file': member.name, 'reason': 'malformed XML'})
                continue
            source = root.findtext('.//t:sourceDesc//t:idno', '', NS).replace('http://', 'https://')
            match = re.fullmatch(r'https://gallica\.bnf\.fr/ark:/12148/(bpt6k\d+[a-z0-9])', source)
            if not match:
                continue
            body = root.find('t:text/t:body', NS)
            if body is None:
                continue
            blocks = []
            def visit(node):
                tag = node.tag.rsplit('}', 1)[-1]
                if tag in ('p', 'head', 'l', 'ab', 'item', 'row'):
                    text = re.sub(r'\s+', ' ', ''.join(node.itertext())).strip()
                    if text: blocks.append(text)
                else:
                    for child in node: visit(child)
            visit(body)
            text = '\n\n'.join(blocks)
            if len(text) < 100 or len(text.encode()) > 4 * 1024 * 1024:
                continue
            item = metadata[member.name]
            authors = [''.join(a.itertext()).strip() for a in root.findall('.//t:titleStmt/t:author', NS)]
            title = item.get('title') or root.findtext('.//t:titleStmt/t:title', '', NS)
            if not title:
                continue
            book = {'id': 'gallica:' + match[1], 'source': 'gallica', 'sourceUrl': source,
                    'title': title, 'authors': authors, 'language': 'fr', 'languages': ['fr'],
                    'cover': None, 'subjects': [], 'description': 'French OCR text from the BnF–OBVIL public TEI collection. Transcription errors may remain.',
                    'access': 'read', 'formats': ['TXT'],
                    'rights': 'Source: gallica.bnf.fr / Bibliothèque nationale de France. OCR conversion: BnF–OBVIL. Gallica reuse conditions apply; commercial reuse requires the relevant permission.'}
            if str(item.get('date', '')).isdigit(): book['year'] = int(item['date'])
            records[book['id']] = {'book': book, 'text': text}
if not records:
    raise ValueError('No valid complete TEI documents')
content_dir = Path('public/data/gallica')
content_dir.mkdir(parents=True, exist_ok=True)
index = []
for record in records.values():
    book = record['book']
    content = {'type': 'text', 'text': record['text'], 'chapters': [], 'sourceUrl': book['sourceUrl'], 'attribution': book['rights']}
    packed = gzip.compress(json.dumps(content, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    content_dir.joinpath(book['id'].split(':')[1] + '.json.gz').write_bytes(packed)
    index.append({'book': book, 'sha256': hashlib.sha256(packed).hexdigest(), 'bytes': len(packed)})
output = {'updatedAt': datetime.now(timezone.utc).isoformat(), 'provenance': provenance, 'excluded': excluded, 'records': index}
target = Path('server/data/gallica.json.gz')
target.with_suffix('.tmp').write_bytes(gzip.compress(json.dumps(output, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
target.with_suffix('.tmp').replace(target)
print(json.dumps({'books': len(records), 'bytes': target.stat().st_size, 'archives': provenance, 'excluded': excluded}))
