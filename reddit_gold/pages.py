from pylons import tmpl_context as c
from pylons import app_globals as g

from r2.lib.pages import BoringPage, ProfilePage
from r2.lib.wrapped import Templated
from r2.models import Link, Subreddit
from reddit_gold.models import GoldFeature, GoldPartner, GoldPartnerDealCode


class GoldInfoPage(BoringPage):
    def __init__(self, *args, **kwargs):
        self.prices = {
            "gold_month_price": g.gold_month_price,
            "gold_year_price": g.gold_year_price,
        }
        self.top_features = []
        self.other_features = []
        self.top_partners = []

        all_features = GoldFeature.get_all()
        for feature in all_features:
            feature.extra_classes = 'new' if feature.is_new else ''
            if feature.is_top:
                self.top_features.append(feature)
            else:
                self.other_features.append(feature)

        all_partners = GoldPartner.get_all()
        for partner in all_partners:
            if partner.is_top:
                self.top_partners.append(partner)

        BoringPage.__init__(self, *args, **kwargs)


class GoldPartnersPage(BoringPage):
    def __init__(self, *args, **kwargs):
        self.prices = {
            "gold_month_price": g.gold_month_price,
            "gold_year_price": g.gold_year_price,
        }

        self.partners = GoldPartner.get_all()
        self.categories = set()
        self.giveaways = []

        # batch-lookup the Links and Subreddits for discussions
        id36s = [p.discussion_id36 for p in self.partners if p.discussion_id36]
        links = Link._byID36(id36s, data=True)
        subreddits = Subreddit._byID([link.sr_id for link in links.values()],
                                     data=True)

        for partner in self.partners:
            if partner.category:
                self.categories.add(partner.category)

            extra_classes = partner.css_classes
            if partner.is_new:
                extra_classes.append('new')
            partner.extra_classes = ' '.join(extra_classes)

            if partner.giveaway_desc:
                self.giveaways.append('{0}: {1}'
                                      .format(partner.name,
                                              partner.giveaway_desc))

            if partner.discussion_id36:
                link = links[partner.discussion_id36]
                subreddit = subreddits[link.sr_id]
                partner.discussion_url = link.make_permalink(subreddit)
                partner.discussion_num_comments = link.num_comments
            else:
                partner.discussion_url = None
                partner.discussion_num_comments = None

        self.categories = sorted(self.categories)

        if c.user_is_loggedin:
            self.existing_codes = GoldPartnerDealCode.get_codes_for_user(c.user)
        else:
            self.existing_codes = []
        BoringPage.__init__(self, *args, **kwargs)


class SnoovatarProfilePage(ProfilePage):
    extra_stylesheets = ['gold.less']

    def build_toolbars(self):
        # just show the page name and none of the tabs
        toolbars = ProfilePage.build_toolbars(self)
        return toolbars[:1]


class Snoovatar(Templated):
    def __init__(self, editable, snoovatar, username):
        self.editable = editable
        self.snoovatar = snoovatar
        self.username = username
        Templated.__init__(self)
