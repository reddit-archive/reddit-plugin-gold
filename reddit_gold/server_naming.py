import datetime
import json

from pylons import g, c
from sqlalchemy.sql.expression import select, distinct, func

from r2.lib.base import abort
from r2.lib.errors import errors
from r2.lib.hooks import HookRegistrar
from r2.lib.memoize import memoize
from r2.models import Subreddit, Link, Comment
from r2.models.gold import gold_table, ENGINE, TIMEZONE


hooks = HookRegistrar()


@memoize("gold-buyers", time=86400)
def gold_buyers_on(date):
    start_date = datetime.datetime.combine(date, datetime.time.min)
    end_date = datetime.datetime.combine(date, datetime.time.max)

    NON_REVENUE_STATUSES = ("declined", "chargeback", "fudge")
    date_expr = func.timezone(TIMEZONE.zone, gold_table.c.date)
    query = (select([distinct(gold_table.c.account_id)])
                .where(~ gold_table.c.status.in_(NON_REVENUE_STATUSES))
                .where(date_expr >= start_date)
                .where(date_expr <= end_date)
                .where(gold_table.c.pennies > 0)
            )
    rows = ENGINE.execute(query)
    return [int(account_id) for (account_id,) in rows.fetchall()]


def gold_buyers_yesterday():
    one_day = datetime.timedelta(days=1)
    yesterday = datetime.datetime.now(TIMEZONE).date() - one_day
    return gold_buyers_on(yesterday)


@hooks.on("reddit.request.begin")
def add_gold_hostname():
    c.gold_hostname = ""

    if g.gold_hostname_file:
        try:
            with open(g.gold_hostname_file) as f:
                c.gold_hostname = json.loads(f.read().strip())
        except IOError:
            pass


@hooks.on("subreddit.can_comment")
def nameaserver_can_comment(sr, user):
    if sr.name == g.gold_servername_sr:
        return sr.is_moderator(user) or user._id in gold_buyers_yesterday()


@hooks.on("comment.validate")
def nameaserver_comment_lockdown(sr, link, parent_comment):
    if sr.name == g.gold_servername_sr:
        if (hasattr(link, "revenue_date") and
                not link.contest_mode and
                not sr.is_moderator(c.user)):
            # this link is not one of the currently active ones. no comments!
            c.errors.add(errors.TOO_OLD, field="parent")


@hooks.on("vote.validate")
def nameaserver_vote_lockdown(thing):
    if getattr(thing, "sr_id", None):
        sr = Subreddit._byID(thing.sr_id, data=True)
        if sr.name == g.gold_servername_sr:
            if isinstance(thing, Link):
                # no votes on links in this subreddit
                abort(403, "Forbidden")
            elif isinstance(thing, Comment):
                # only allow votes on comments in active threads by people
                # who bought gold.
                link = Link._byID(thing.link_id, data=True)

                if (hasattr(link, "revenue_date") and
                    (not link.contest_mode or
                     c.user._id not in gold_buyers_on(link.revenue_date))):
                    abort(403, "Forbidden")
