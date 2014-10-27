from datetime import datetime
import json

from pylons import g
from sqlalchemy import func
from sqlalchemy.orm.exc import NoResultFound
from sqlalchemy.schema import Column
from sqlalchemy.sql import and_
from sqlalchemy.types import DateTime, Integer, String
from r2.models import Frontpage
from r2.models.gold import Base, Session
from r2.models.wiki import WikiPageIniItem
from r2.lib.db import tdb_cassandra


def with_sqlalchemy_session(f):
    """Ensures sqlalchemy session is closed (due to connection pooling)."""
    def close_session_after(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        finally:
            Session.remove()

    return close_session_after


class GoldFeature(WikiPageIniItem):
    """Information about reddit gold features."""

    @classmethod
    def _get_wiki_config(cls):
        return Frontpage, g.wiki_page_gold_features

    def __init__(self, id, name, description, image_url, is_enabled=True,
                 is_new=False):
        self.id = id
        self.name = name
        self.description = description
        self.image_url = image_url
        self.is_enabled = is_enabled
        self.is_new = is_new


class GoldPartnerCodesExhaustedError(Exception):
    pass


class GoldPartner(WikiPageIniItem):
    """Information about reddit gold partners."""
    
    @classmethod
    def _get_wiki_config(cls):
        return Frontpage, g.wiki_page_gold_partners

    def __init__(self, id, name, about_page_desc, short_desc, url, image_url,
                 is_enabled=True, is_new=False, instructions=None,
                 discussion_id36=None, button_label=None, button_dest=None,
                 claim_dest=None, giveaway_desc=None, css_classes=None,
                 category=None, **kwargs):
        self.id = id
        self.name = name
        self.category = category
        self.about_page_desc = about_page_desc
        self.short_desc = short_desc
        self.url = url
        self.image_url = image_url
        self.is_enabled = is_enabled
        self.is_new = is_new
        self.instructions = instructions
        self.discussion_id36 = discussion_id36
        self.button_label = button_label
        self.button_dest = button_dest
        self.claim_dest = claim_dest
        self.giveaway_desc = giveaway_desc
        self.css_classes = css_classes.split(' ') if css_classes else []


class GoldPartnerDealCode(Base):
    """Promo codes for deals from reddit gold partners."""

    __tablename__ = "reddit_gold_partner_deal_codes"

    id = Column(Integer, primary_key=True)
    deal = Column(String, nullable=False)
    code = Column(String, nullable=False)
    user = Column(Integer, nullable=True)
    date = Column(DateTime(timezone=True), nullable=True)

    @classmethod
    @with_sqlalchemy_session
    def get_codes_for_user(cls, user):
        results = Session.query(cls).filter(cls.user == user._id)
        codes = {r.deal: r.code for r in results}
        return codes
    
    @classmethod
    @with_sqlalchemy_session
    def claim_code(cls, user, deal):
        # check if they already have a code for this deal and return it
        try:
            result = (Session.query(cls)
                      .filter(and_(cls.user == user._id,
                                   cls.deal == deal))
                      .one())
            return result.code
        except NoResultFound:
            pass

        # select an unclaimed code, assign it to the user, and return it
        try:
            claiming = (Session.query(cls)
                        .filter(and_(cls.deal == deal,
                                     cls.user == None,
                                     func.pg_try_advisory_lock(cls.id)))
                        .limit(1)
                        .one())
        except NoResultFound:
            raise GoldPartnerCodesExhaustedError

        claiming.user = user._id
        claiming.date = datetime.now(g.tz)
        Session.add(claiming)
        Session.commit()

        # release the lock
        Session.query(func.pg_advisory_unlock_all()).all()

        return claiming.code 


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
