import datetime
import os
import random
import re

from itertools import chain

from pylons import g

from r2.lib.amqp import worker
from r2.lib.db import queries
from r2.lib.utils import in_chunks
from r2.models import Thing, Account, Subreddit, Link, Comment
from r2.models.admintools import send_system_message
from r2.models.gold import gold_revenue_on, gold_goal_on, TIMEZONE
from r2.models.wiki import WikiPage
from r2.lib.comment_tree import get_comment_tree
from r2.lib.db import tdb_cassandra

from reddit_gold.server_naming import gold_buyers_on


SERVERNAME_SR = Subreddit._by_name(g.gold_servername_sr)
SYSTEM_ACCOUNT = Account._by_name(g.system_user)


def get_recent_name_submissions():
    link_fullnames = list(queries.get_links(SERVERNAME_SR, "new", "all"))
    links = chain.from_iterable(Thing._by_fullname(chunk, return_dict=False)
                                for chunk in in_chunks(link_fullnames))

    for link in links:
        if link._deleted or link._spam:
            continue

        # OH GOD WHAT HAVE YOU POSTED IN MY LOVELY AUTOMATED SUBREDDIT!?
        if (not hasattr(link, "revenue_date") or
            not hasattr(link, "revenue_bucket") or
            not hasattr(link, "server_names")):
            continue

        yield link


def post_if_goal_reached(date):
    # bail out if this day's already been submitted
    for link in get_recent_name_submissions():
        if link.revenue_date == date:
            return

    revenue = gold_revenue_on(date)
    goal = gold_goal_on(date)
    percent = revenue / goal
    bucket = int(percent)
    if bucket == 0:
        return

    buyer_count = len(gold_buyers_on(date))

    link = Link._submit(
        title=date.strftime("%a %Y-%m-%d"),
        url="self",
        author=SYSTEM_ACCOUNT,
        sr=SERVERNAME_SR,
        ip="127.0.0.1",
        spam=False,
    )

    template_wp = WikiPage.get(SERVERNAME_SR, "templates/selftext")
    template = random.choice(template_wp._get("content").split("\r\n---\r\n"))
    boilerplate = WikiPage.get(SERVERNAME_SR, "templates/boilerplate")._get("content")
    selftext_template = template + "\n\n---\n\n" + boilerplate

    link.flair_text = "Name pending..."
    link.flair_css_class = "goal-bucket-%d-active" % bucket
    link.revenue_date = date
    link.revenue_bucket = bucket
    link.server_names = []
    link.contest_mode = True
    link.url = link.make_permalink(SERVERNAME_SR)
    link.selftext = selftext_template % {
        "percent": int(percent * 100),
        "buyers": buyer_count,
    }
    link.is_self = True
    link._commit()

    UPVOTE = True
    queries.queue_vote(SYSTEM_ACCOUNT, link, UPVOTE, "127.0.0.1")
    queries.new_link(link)
    queries.changed(link)

    template = WikiPage.get(SERVERNAME_SR, "templates/notification-message")._get("content")
    subject_template, sep, body_template = template.partition("\r\n")
    for id in gold_buyers_on(date):
        recipient = Account._byID(id, data=True)
        send_system_message(
            recipient,
            subject_template,
            body_template % {
                "percent": int(percent * 100),
                "buyers": buyer_count,
                "user": recipient.name,
                "link": link.url,
            },
        )


def activate_requested_names(but_not):
    date_to_exclude = but_not

    for link in get_recent_name_submissions():
        if not link.contest_mode or link.revenue_date == date_to_exclude:
            continue

        activate_names_requested_in(link)


valid_name_re = re.compile("^[A-Za-z0-9-]{1,25}$")
def activate_names_requested_in(link):
    tree = get_comment_tree(link)
    acceptable_names = []
    if tree.tree:
        top_level_cids = tree.tree[None]
        comments = chain.from_iterable(Comment._byID(chunk, return_dict=False,
                                                     data=True)
                                       for chunk in in_chunks(top_level_cids))

        for comment in sorted(comments, key=lambda c: c._ups, reverse=True):
            if comment._spam or comment._deleted:
                continue

            sanitized = comment.body.strip()
            if valid_name_re.match(sanitized):
                acceptable_names.append((comment, sanitized))

    # we activate one name for each 100% of rev goal met
    names = acceptable_names[:link.revenue_bucket]
    activate_names(link, names)

    activated_names = [name for comment, name in names]
    link.server_names = activated_names
    link.contest_mode = False
    link.flair_text = ", ".join(activated_names) if names else "/dev/null"
    link.flair_css_class = "goal-bucket-%d" % link.revenue_bucket
    link._commit()


def activate_names(link, names):
    for comment, name in names:
        # find a slot to assign a name to. we'll prefer nodes that are
        # currently empty, and failing that find the least-recently-modified
        # node.
        ROOT = "/gold/server-names"
        slot_names = g.zookeeper.get_children(ROOT)
        slots = [(slot_name, g.zookeeper.get(os.path.join(ROOT, slot_name)))
                 for slot_name in slot_names]
        slots.sort(key=lambda (path, (data, stat)): (bool(data), stat.mtime))
        slot_path = os.path.join(ROOT, slots[0][0])

        g.zookeeper.set(slot_path, str(name))

        lock = g.zookeeper.Lock(slot_path)
        lock_contenders = lock.contenders()
        old_name = lock_contenders[0] if lock_contenders else ""
        old_name = old_name or "one of our servers"

        # reply to the user
        wp = WikiPage.get(SERVERNAME_SR, "templates/success-reply")
        template = random.choice(wp._get("content").split("\r\n---\r\n"))
        comment, inbox_rel = Comment._new(
            author=SYSTEM_ACCOUNT,
            link=link,
            parent=comment,
            body=template % {
                "old-name": old_name,
                "new-name": name,
            },
            ip="127.0.0.1",
        )
        queries.queue_vote(SYSTEM_ACCOUNT, comment, dir=True, ip="127.0.0.1")
        queries.new_comment(comment, inbox_rel)


def update_sidebar():
    MAX_HEADING = 6
    LOG_ENTRIES = 30

    links = sorted(
        get_recent_name_submissions(),
        key=lambda L: L.revenue_date,
        reverse=True,
    )[:LOG_ENTRIES]

    lines = []
    for link in links:
        date_text = link.revenue_date.strftime("%b-%d")

        # contest_mode will be on for active threads
        if link.contest_mode:
            server_names = "<<in progress>>"
        else:
            if link.server_names:
                server_names = ", ".join(link.server_names)
            else:
                server_names = "/dev/null"

        lines.append("%s [%s: **%s**](%s)\n\n" % (
            "#" * max(MAX_HEADING - link.revenue_bucket + 1, 1)
                if link.revenue_bucket > 0 else ">",
            date_text,
            server_names,
            link.make_permalink(SERVERNAME_SR),
        ))

    # preserve human-edited content before the first <hr>
    human_content, hr, junk = SERVERNAME_SR.description.partition("---")
    SERVERNAME_SR.description = human_content + "---\n\n" + "".join(lines)
    SERVERNAME_SR._commit()


def main():
    now = datetime.datetime.now(TIMEZONE)

    # post a new thread if we met our revenue goal
    yesterday = (now - datetime.timedelta(days=1)).date()
    post_if_goal_reached(yesterday)

    # look at old (now complete) threads if any
    activate_requested_names(but_not=yesterday)

    # wait until all our amqp / permacache changes are flushed from the
    # in-process queue.
    worker.join()
    g.reset_caches()

    # update the sidebar with a list of names
    update_sidebar()


if g.running_as_script:
    main()
