from pylons import c
from pylons.i18n import _

from r2.controllers import add_controller
from r2.controllers.reddit_base import RedditController
from r2.lib.validator import (
    json_validate,
    VGold,
    VLength,
    VModhash,
    VUser,
)
from reddit_gold.models import GoldPartnerDealCode, GoldPartnerCodesExhaustedError
from reddit_gold.pages import GoldInfoPage, GoldPartnersPage

@add_controller
class GoldController(RedditController):
    def GET_about(self):
        return GoldInfoPage(_("gold"), show_sidebar=False).render()

    def GET_partners(self):
        return GoldPartnersPage(_("gold partners"), show_sidebar=False).render()

@add_controller
class GoldApiController(RedditController):
    @json_validate(VUser(),
                   VGold(),
                   VModhash(),
                   deal=VLength('deal', 100))
    def POST_claim_gold_partner_deal_code(self, responder, deal):
        try:
            return {'code': GoldPartnerDealCode.claim_code(c.user, deal)}
        except GoldPartnerCodesExhaustedError:
            return {'error': 'GOLD_PARTNER_CODES_EXHAUSTED',
                    'explanation': _("sorry, we're out of codes!")}

