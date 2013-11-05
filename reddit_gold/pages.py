from pylons import c, g

from r2.lib.pages import BoringPage
from r2.models import Link
from reddit_gold.models import GoldPartner, GoldPartnerDealCode


class GoldInfoPage(BoringPage):
    def __init__(self, *args, **kwargs):
        self.prices = {
            "gold_month_price": g.gold_month_price,
            "gold_year_price": g.gold_year_price,
        }
        self.partners = GoldPartner.get_all_partners()
        BoringPage.__init__(self, *args, **kwargs)


class GoldPartnersPage(BoringPage):
    def __init__(self, *args, **kwargs):
        self.prices = {
            "gold_month_price": g.gold_month_price,
            "gold_year_price": g.gold_year_price,
        }

        self.partners = GoldPartner.get_all_partners()
        self.giveaways = []
        first = True
        for partner in self.partners:
            extra_classes = []
            if first:
                extra_classes.append('first')
                first = False
            if partner.is_new:
                extra_classes.append('new')
            if partner.css_classes:
                extra_classes += partner.css_classes
            partner.extra_classes = ' '.join(extra_classes)

            if partner.giveaway_desc:
                self.giveaways.append('{0}: {1}'
                                      .format(partner.name,
                                              partner.giveaway_desc))

            if partner.discussion_id36:
                link = Link._byID36(partner.discussion_id36, data=True)
                partner.discussion_url = link.make_permalink_slow()
                partner.discussion_num_comments = link.num_comments
            else:
                partner.discussion_url = None
                partner.discussion_num_comments = None

        if c.user_is_loggedin:
            self.existing_codes = GoldPartnerDealCode.get_codes_for_user(c.user)
        else:
            self.existing_codes = []
        BoringPage.__init__(self, *args, **kwargs)
