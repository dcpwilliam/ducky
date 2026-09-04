import json
import logging
from typing import Any
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logger = logging.getLogger('ducky.pypi')

PYPI_API = 'https://pypi.org/pypi'


class PypiService:
    async def package_info(self, name: str = '', **kw: Any) -> dict:
        url = f'{PYPI_API}/{name}/json'
        try:
            req = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'ducky/0.1'})
            with urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())

            info = data.get('info', {})
            return {
                'name': info.get('name'),
                'version': info.get('version'),
                'summary': info.get('summary'),
                'homePage': info.get('home_page'),
                'author': info.get('author'),
                'license': info.get('license'),
                'requiresPython': info.get('requires_python'),
                'projectUrl': info.get('project_url'),
                'releases': list(data.get('releases', {}).keys())[-10:]
            }
        except HTTPError as e:
            if e.code == 404:
                return {'error': f'Package "{name}" not found'}
            raise
        except URLError as e:
            return {'error': f'Network error: {e.reason}'}

    async def search(self, query: str = '', **kw: Any) -> dict:
        url = f'https://pypi.org/search/?q={query}'
        try:
            req = Request(url, headers={'User-Agent': 'ducky/0.1'})
            with urlopen(req, timeout=10) as resp:
                html = resp.read().decode()

            results = []
            import re
            pattern = r'<span class="package-snippet__name">(.*?)</span>.*?<span class="package-snippet__version">(.*?)</span>.*?<span class="package-snippet__description">(.*?)</span>'
            for match in re.finditer(pattern, html, re.DOTALL):
                results.append({
                    'name': match.group(1).strip(),
                    'version': match.group(2).strip(),
                    'description': match.group(3).strip()
                })

            return {'results': results[:20]}
        except Exception as e:
            return {'results': [], 'error': str(e)}
