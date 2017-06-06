from collections import deque, defaultdict
from datetime import datetime
import StringIO, csv, psycopg2

from pylons import app_globals as g
from r2.lib import emailer
from r2.models.gold import Base, Session
from sqlalchemy import create_engine
from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base


session = Session()

class GoldTransaction(Base):
    __tablename__ = 'reddit_gold'

    _charter_end = datetime(2010, 7, 20, 8, 6, 10, 365317, tzinfo=psycopg2.tz.FixedOffsetTimezone(offset=-420, name=None))

    # database columns
    trans_id = Column(String, primary_key=True)
    status = Column(String)
    date = Column(DateTime)
    payer_email = Column(String)
    paying_id = Column(String)
    pennies = Column(Integer)
    secret = Column(String)
    account_id = Column(String)
    days = Column(Integer)
    subscr_id = Column(String)

    DESCRIPTIONS = {
        "onetime-self": "One-time subscription purchase for self",
        "subscription": "Auto-renewing subscription for self (unknown if initial setup or automatic payment)",
        "subscription-new": "New auto-renewing subscription for self",
        "subscription-auto": "Automatic recurring payment for subscription",
        "creddits": "Creddit purchase",
        "gift": "Gift to other user, immediately applied",
        "gift-creddit": "Gift to other user, immediately applied (used creddit)",
        "giftcode": "Gift code purchase",
        "gilding": "Gilding - gift to other user, immediately applied",
        "gilding-creddit": "Gilding (used creddit) - gift to other user, immediately applied",
        "rg-elves": "redditgifts Elves bundle",
        "postcard": "Postcard",
        "unknown": "Unknown",
    }

    overrides = {}

    @property
    def transaction_id(self):
        if 'trans_id' in self.overrides:
            return self.overrides['trans_id']
        
        return self.trans_id

    @property
    def type(self):
        if 'type' in self.overrides:
            return self.overrides['type']

        secret = self.secret or ''

        # Statuses to check for first
        if self.status == 'expired-promo':
            return 'expired-promo'
        if self.paying_id == 'bundle':
            return 'appsumo-bundle'

        # Charter member payments
        if self.date <= self._charter_end or secret.startswith('o_'):
            return 'charter'

        # RG Elves
        if self.trans_id.startswith('RG'):
            if self.revenue % 399 != 0 and self.revenue % 2999 != 0:
                return 'rg-elves'
        
        # Subscriptions
        if self.subscr_id:
            if secret.startswith('autorenew-'):
                # no easy way to tell if a Stripe subscription is new or automatic
                if self.subscr_id.startswith('cus_'):
                    return 'subscription'
                else:
                    return 'subscription-new'
            else:
                return 'subscription-auto'

        # Gift code purchases
        if self.status in ('claimed', 'unclaimed') and len(secret) == 10:
            return 'giftcode'

        # Creddit purchases
        if secret.startswith(('creddits-', '{creddits,', 'cr_')):
            # some old strange transactions have 0 days
            # looks like people experimenting with sending custom amounts
            if self.days != 0:
                return 'creddits'

        # Gifts and Gildings
        if self.status == 'gift':
            if self.trans_id.endswith('-A'):
                trans_type = 'gilding'
            else:
                trans_type = 'gift'

            if self.revenue == 0:
                trans_type += '-creddit'

            return trans_type

        if self.status == 'instagift':
            return 'gilding'

        if secret.startswith(('{gift,', 'gift-')):
            return 'gift'

        # One-time purchases
        if secret.startswith(('onetime-', '{onetime,')) or not secret:
            return 'onetime-self'

        # Manual grants via codes
        if self.trans_id.startswith('M'):
            if secret.startswith(('p_', 'c_')):
                return 'postcard'
            elif secret.startswith(('el_', 'e_')):
                return 'extralife'

            return 'other-manual'

        return 'unknown'
        

    @property
    def description(self):
        if 'description' in self.overrides:
            return self.overrides['description']

        if self.type in self.DESCRIPTIONS:
            return self.DESCRIPTIONS[self.type]

        return self.type

    @property
    def payer(self):
        if self.type in ('creddits', 'onetime-self', 'subscription-new', 'subscription-auto'):
            return self.account_id

        return self.paying_id

    # used for the trans types that cover 2 rows in the db
    @property
    def is_split(self):
        if self.type in ('gilding', 'gift', 'rg-elves'):
            return True
        return False

    @property
    def is_reversed(self):
        if 'is_reversed' in self.overrides:
            return self.overrides['is_reversed']
        
        if self.status == "reversed":
            return True
        return False

    @property
    def processor(self):
        if 'processor' in self.overrides:
            return self.overrides['processor']

        if self.trans_id.startswith('g'):
            return 'Google Payments'
        elif self.trans_id.startswith('P'):
            return 'Paypal'
        elif self.trans_id.startswith('RG'):
            return 'redditgifts (Balanced)'
        elif self.trans_id.startswith('Sch_'):
            return 'Stripe'
        elif self.trans_id.startswith('C'):
            return 'Coinbase'
        
        return 'Unknown'

    @property
    def revenue(self):
        if 'pennies' in self.overrides:
            return self.overrides['pennies']

        return self.pennies

    @property
    def months(self):
        if self.days % 366 == 0:
            return self.days / 366 * 12
        elif self.days % 31 == 0:
            return self.days / 31
        else:
            raise ValueError

    @classmethod
    def get_transactions(cls, start_date=None, end_date=None):
        query = session.query(cls)
        if start_date:
            query = query.filter(cls.date >= start_date)
        if end_date:
            query = query.filter(cls.date < end_date)

        query = query.order_by(cls.date, cls.trans_id)
        query = query.yield_per(1000)   # retrieve 1000 rows at a time

        overrides = {}
        for trans in query:
            if overrides or not trans.is_split:
                trans.overrides = overrides
                overrides = {}
                yield trans
            else:
                overrides['type'] = trans.type
                overrides['pennies'] = trans.pennies
                overrides['trans_id'] = trans.trans_id
                overrides['processor'] = trans.processor
                overrides['description'] = trans.description
                overrides['is_reversed'] = trans.is_reversed


class Creddit(object):
    def __init__(self, value, processor, purchase_time):
        self.value = value
        self.processor = processor
        self.purchase_time = purchase_time
        if self.purchase_time < datetime(2013, 1, 1, tzinfo=psycopg2.tz.FixedOffsetTimezone(offset=-420, name=None)):
            self.value = 0


def get_creddit_balances_on(date):
    user_creddits = defaultdict(deque)
    transactions = GoldTransaction.get_transactions(end_date=date)
    for trans in transactions:
        if trans.type == 'creddits':
            creddit = Creddit(value=trans.revenue / trans.months,
                              processor=trans.processor,
                              purchase_time=trans.date)
            user_creddits[trans.account_id].extend([creddit] * trans.months)
        elif trans.type.endswith('-creddit'):
            for _ in xrange(trans.months):
                try:
                    user_creddits[trans.payer].popleft()
                except:
                    break

    return user_creddits


def run_for_prev_month():
    end_date = datetime(datetime.now().year, datetime.now().month, 1)
    if end_date.month == 1:
        start_date = datetime(end_date.year-1, 12, 1)
    else:
        start_date = datetime(end_date.year, end_date.month-1, 1)

    user_creddits = get_creddit_balances_on(start_date)

    output = StringIO.StringIO()
    writer = csv.writer(output, delimiter=',', quotechar='"')
    data = [
            'Date/time',
            'Transaction ID',
            'Type',
            'Description',
            'Amount Billed',
            'Value',
            'Processor',
            'Period (Days)',
            'Payer Account',
            'Recipient Account']
    writer.writerow(data)

    transactions = GoldTransaction.get_transactions(start_date, end_date)
    for trans in transactions:
        value = trans.revenue

        if trans.type == 'creddits':
            creddit = Creddit(value=trans.revenue / trans.months,
                              processor=trans.processor,
                              purchase_time=trans.date)
            user_creddits[trans.account_id].extend([creddit] * trans.months)
            value = 0
    
        elif trans.type == 'giftcode':
            value = 0

        elif trans.type.endswith('-creddit'):
            # if the user has creddits that we know how they paid for
            num_creddits = len(user_creddits[trans.payer])
            if num_creddits > 0:
                value = sum(c.value for c in user_creddits[trans.payer])
                value = value / num_creddits
                # if this purchase would use more creddits than we know about
                # make sure not to add value for non-existent creddits
                value = value * min(num_creddits, trans.months)

                # remove the used creddits
                for _ in xrange(trans.months):
                    try:
                        user_creddits[trans.payer].popleft()
                    except:
                        break
        data = [
            trans.date,
            trans.transaction_id,
            "reversed" if trans.is_reversed else trans.type,
            trans.description,
            trans.revenue,
            value,
            trans.processor,
            trans.days,
            trans.payer,
            trans.account_id
        ]
        writer.writerow(data)

    body=("""<!doctype html><html><body>
        <span>Attached is the requested gold accounting file for %s to %s</span>
        </body></html>""" %
         (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
 
    filename=('gold_accounting_{0}_to_{1}.csv'
                .format(start_date.strftime('%Y-%m-%d'),
                        end_date.strftime('%Y-%m-%d')))
    send_email(body, [{"name": filename, "contents": output.getvalue()}])


def send_email(body, attachments):
    emailer.send_html_email(
        g.accounting_email,
        g.feedback_email,
        datetime.today().strftime("Gold accounting report for %d %b %Y"),
        body,
        attachments=attachments,
    )

if g.running_as_script:
    run_for_prev_month()
