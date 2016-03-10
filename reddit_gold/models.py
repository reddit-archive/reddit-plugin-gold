import json

from pylons import app_globals as g
from r2.models import Frontpage
from r2.models.wiki import WikiPageIniItem
from r2.lib.db import tdb_cassandra


class GoldFeature(WikiPageIniItem):
    """Information about reddit gold features."""

    @classmethod
    def _get_wiki_config(cls):
        return Frontpage, g.wiki_page_gold_features

    def __init__(self, id, name, description, image_url, is_enabled=True,
                 is_new=False, is_top=False):
        self.id = id
        self.name = name
        self.description = description
        self.image_url = image_url
        self.is_enabled = is_enabled
        self.is_new = is_new


class SnoovatarsByAccount(tdb_cassandra.View):
    _use_db = True
    _compare_with = "AsciiType"
    _extra_schema_creation_args = {
        "key_validation_class": "AsciiType",
        "default_validation_class": "UTF8Type",
    }

    @classmethod
    def load(cls, user, name):
        try:
            data = cls._byID(user._id36, properties=[name])
        except tdb_cassandra.NotFound:
            return {}

        raw_json = data[name]
        return json.loads(raw_json)

    @classmethod
    def save(cls, user, name, public, snoo_color, components):
        cls._set_values(user._id36, {name: json.dumps({
            "public": public,
            "snoo_color": snoo_color,
            "components": components,
        })})

        if user.pref_show_snoovatar != public:
            user.pref_show_snoovatar = public
            user._commit()
