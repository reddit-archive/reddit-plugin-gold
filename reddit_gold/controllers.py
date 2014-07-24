from pylons import c
from pylons.i18n import _

from r2.controllers import add_controller
from r2.controllers.reddit_base import RedditController
from r2.lib.errors import errors
from r2.lib.validator import (
    json_validate,
    validate,
    validatedForm,
    ValidEmail,
    VGold,
    VLength,
    VModhash,
    VOneOf,
    VUser,
)
from reddit_gold.models import (
    GoldAppBetaSignup,
    GoldAppDuplicateRegistrationError,
    GoldPartnerCodesExhaustedError,
    GoldPartnerDealCode,
)
from reddit_gold.pages import (
    GoldAppBetaPage,
    GoldInfoPage,
    GoldPartnersPage,
)


@add_controller
class GoldController(RedditController):
    def GET_about(self):
        return GoldInfoPage(_("gold"), show_sidebar=False).render()

    def GET_partners(self):
        return GoldPartnersPage(_("gold partners"), show_sidebar=False).render()

    @validate(
        VUser(),
        VGold(),
    )
    def GET_app_beta(self):
        return GoldAppBetaPage(_("gold app beta"), show_sidebar=False).render()


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

    @validatedForm(
        VUser(),
        VGold(),
        email=ValidEmail("email"),
        os=VOneOf("os", ("android", "ios")),
    )
    def POST_register_for_app_beta(self, form, jquery, email, os):
        if not os:
            form.set_html("#os-error", "please select your mobile os")
            return

        if form.has_errors("email", errors.NO_EMAIL, errors.BAD_EMAIL):
            return

        if getattr(c.user, "ama_app_beta_registered", False):
            form.set_html(".status", "you've already registered")
            return

        try:
            GoldAppBetaSignup(c.user, email, os)
            c.user.ama_app_beta_registered = True
            c.user._commit()
            # reload the page for registered message
            form.redirect("/gold/appbeta")
        except GoldAppDuplicateRegistrationError:
            form.set_html(".status", "you've already registered")
