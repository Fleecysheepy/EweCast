"""Build a same-origin snapshot of the public feeds for browsers on GitHub Pages."""
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from email.utils import parsedate_to_datetime

ATOM = "{http://www.w3.org/2005/Atom}"


def download(url):
    with urlopen(Request(url, headers={"User-Agent": "EweCast public feed reader"}), timeout=20) as response:
        return ET.fromstring(response.read(4_000_000))


def alberta():
    root = download("https://www.alberta.ca/data/aea/rss/feed-full.atom")
    if root.tag != ATOM + "feed":
        raise ValueError("Unexpected Alberta feed")
    items = []
    for entry in root.findall(ATOM + "entry"):
        title = entry.findtext(ATOM + "title", "").strip()
        links = entry.findall(ATOM + "link")
        url = next((x.get("href") for x in links if x.get("rel", "alternate") == "alternate"), None)
        if not title or not url:
            raise ValueError("Incomplete Alberta alert")
        if not title.lower().startswith(("no active ", "no current ")):
            items.append({"title": title, "url": url})
    return items


def news():
    root = download("https://www.cbc.ca/cmlink/rss-canada-edmonton")
    channel = root.find("channel")
    if channel is None:
        raise ValueError("Unexpected CBC feed")
    items = []
    for item in channel.findall("item"):
        title = item.findtext("title", "").strip()
        url = item.findtext("link", "").strip()
        try:
            age = datetime.now(timezone.utc) - parsedate_to_datetime(item.findtext("pubDate", ""))
        except (TypeError, ValueError):
            continue
        if title and url and 0 <= age.total_seconds() <= 7 * 86400:
            items.append({"title": title, "url": url})
    return items[:6]


result = {}
for key, reader in (("emergency", alberta), ("news", news)):
    try:
        result[key] = reader()
    except Exception as error:
        print(f"{key}: {error}")
        result[key] = None
result["checked"] = datetime.now(timezone.utc).isoformat()
Path("feeds.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

