from ConfigParser import SafeConfigParser
from datetime import datetime
from pylons import g
from sqlalchemy import func
from sqlalchemy.orm.exc import NoResultFound
from sqlalchemy.schema import Column
from sqlalchemy.sql import and_
from sqlalchemy.types import DateTime, Integer, String
from StringIO import StringIO

from r2.lib.db.tdb_cassandra import NotFound
from r2.models import Frontpage
from r2.models.gold import Base, Session
from r2.models.wiki import WikiPage


def with_sqlalchemy_session(f):
    """Ensures sqlalchemy session is closed (due to connection pooling)."""
    def close_session_after(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        finally:
            Session.remove()

    return close_session_after


class WikiPageIniItem(object):
    _bool_values = ("is_enabled", "is_new")

    @classmethod
    def get_all(cls):
        items = []
        try:
            wp = WikiPage.get(Frontpage, cls._wiki_page_name)
        except NotFound:
            return items
        wp_content = StringIO(wp.content)
        cfg = SafeConfigParser(allow_no_value=True)
        cfg.readfp(wp_content)

        for section in cfg.sections():
            def_values = {'id': section}
            for name, value in cfg.items(section):
                # coerce boolean variables
                if name in cls._bool_values:
                    def_values[name] = cfg.getboolean(section, name)
                else:
                    def_values[name] = value

            try:
                item = cls(**def_values)
            except TypeError:
                # a required variable wasn't set for this item, skip
                continue

            if item.is_enabled:
                items.append(item)

        return items


class GoldFeature(WikiPageIniItem):
    """Information about reddit gold features."""
    _wiki_page_name = g.wiki_page_gold_features

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
    _wiki_page_name = g.wiki_page_gold_partners

    def __init__(self, id, name, about_page_desc, short_desc, url, image_url,
                 is_enabled=True, is_new=False, instructions=None,
                 discussion_id36=None, button_label=None, button_dest=None,
                 claim_dest=None, giveaway_desc=None, css_classes=None,
                 **kwargs):
        self.id = id
        self.name = name
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
