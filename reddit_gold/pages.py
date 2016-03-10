from pylons import app_globals as g

from r2.lib.pages import BoringPage, ProfilePage
from r2.lib.wrapped import Templated
from reddit_gold.models import GoldFeature


class GoldInfoPage(BoringPage):
    def __init__(self, *args, **kwargs):
        self.prices = {
            "gold_month_price": g.gold_month_price,
            "gold_year_price": g.gold_year_price,
        }
        self.features = []

        all_features = GoldFeature.get_all()
        for feature in all_features:
            feature.extra_classes = 'new' if feature.is_new else ''
            self.features.append(feature)

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
