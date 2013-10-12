from sqlalchemy import func
from sqlalchemy.orm.exc import NoResultFound
from sqlalchemy.schema import Column
from sqlalchemy.sql import and_
from sqlalchemy.types import DateTime, Integer, String

from r2.models.gold import Base, Session


def with_sqlalchemy_session(f):
    """Ensures sqlalchemy session is closed (due to connection pooling)."""
    def close_session_after(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        finally:
            Session.remove()

    return close_session_after


class GoldPartnerCodesExhaustedError(Exception):
    pass


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
