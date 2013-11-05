import datetime

from pylons import g, c
from sqlalchemy.sql.expression import select

from r2.lib.errors import errors
from r2.lib.hooks import HookRegistrar
from r2.lib.memoize import memoize
from r2.models import Subreddit, Link, Comment
from r2.models.gold import gold_table, ENGINE


hooks = HookRegistrar()


@memoize("gold-buyers", time=86400)
def gold_buyers_on(date):
    start_date = datetime.combine(date, datetime.time.min)
    end_date = datetime.combine(date, datetime.time.max)

    NON_REVENUE_STATUSES = ("declined", "chargeback", "fudge")
    query = (select([gold_table.c.account_id])
                .where(~ gold_table.c.status.in_(NON_REVENUE_STATUSES))
                .where(gold_table.c.date >= start_date)
                .where(gold_table.c.date <= end_date)
                .where(gold_table.c.pennies > 0)
            )
    rows = ENGINE.execute(query)
    return [int(account_id) for (account_id,) in rows.fetchall()]


def gold_buyers_yesterday():
    one_day = datetime.timedelta(days=1)
    yesterday = datetime.datetime.now(g.display_tz).date() - one_day
    return gold_buyers_on(yesterday)


@hooks.on("reddit.request.begin")
def add_gold_hostname():
    c.gold_hostname = ""

    if g.gold_hostname_file:
        try:
            with open(g.gold_hostname_file) as f:
                c.gold_hostname = f.read().strip()
        except IOError:
            pass


@hooks.on("subreddit.can_comment")
def nameaserver_can_comment(sr, user):
    if sr.name == g.gold_servername_sr:
        return user._id in gold_buyers_yesterday()


@hooks.on("comment.validate")
def nameaserver_comment_lockdown(sr, link, parent_comment):
    if sr.name == g.gold_servername_sr:
        if hasattr(link, "revenue_date") and not link.contest_mode:
            # this link is not one of the currently active ones. no comments!
            c.errors.add(errors.TOO_OLD, field="parent")


@hooks.on("vote.forbid")
def nameaserver_vote_lockdown(thing):
    # true => don't count the vote; false/none => it's cool
    if hasattr(thing, "sr_id"):
        sr = Subreddit._byID(thing.sr_id, data=True)
        if sr.name == g.gold_servername_sr:
            if isinstance(thing, Link):
                # no votes on links in this subreddit
                return True
            elif isinstance(thing, Comment):
                # only allow votes on comments in active threads by people
                # who bought gold.
                link = Link._byID(thing.link_id, data=True)

                if not hasattr(link, "revenue_date"):
                    return True
                if not link.contest_mode:
                    return True
                if c.user._id not in gold_buyers_on(link.revenue_date):
                    return True
