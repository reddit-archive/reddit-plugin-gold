from pylons import c, g
from pylons.i18n import _

from r2.controllers import add_controller
from r2.controllers.reddit_base import RedditController
from r2.lib.errors import errors
from r2.lib.validator import (
    json_validate,
    validate,
    validatedForm,
    VBoolean,
    VExistingUname,
    VGold,
    VJSON,
    VLength,
    VModhash,
    VUser,
)
from reddit_gold.models import (
    GoldPartnerCodesExhaustedError,
    GoldPartnerDealCode,
    SnoovatarsByAccount,
)
from reddit_gold.pages import (
    GoldInfoPage,
    GoldPartnersPage,
    Snoovatar,
    SnoovatarProfilePage,
)


@add_controller
class GoldController(RedditController):
    def GET_about(self):
        return GoldInfoPage(_("gold"), show_sidebar=False).render()

    def GET_partners(self):
        return GoldPartnersPage(_("gold partners"), show_sidebar=False).render()

    @validate(
        vuser=VExistingUname("username"),
    )
    def GET_snoovatar(self, vuser):
        if vuser._deleted or not vuser.gold:
            self.abort404()

        snoovatar = SnoovatarsByAccount.load(vuser, "snoo")

        user_is_owner = c.user_is_loggedin and c.user == vuser
        if not user_is_owner:
            if not snoovatar or not snoovatar["public"]:
                self.abort404()

        snoovatar["editable"] = user_is_owner

        return SnoovatarProfilePage(
            user=vuser,
            content=Snoovatar(
                snoovatar=snoovatar,
                tailors=g.plugins['gold'].tailors_data,
                username=vuser.name,
            ),
        ).render()


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
        VModhash(),
        public=VBoolean("public"),
        components=VJSON("components"),
    )
    def POST_snoovatar(self, form, jquery, public, components):
        if form.has_errors("components",
                           errors.NO_TEXT,
                           errors.TOO_LONG,
                           errors.BAD_STRING
                          ):
            return

        # TODO: use item manifest to validate components

        SnoovatarsByAccount.save(
            user=c.user,
            name="snoo",
            public=public,
            components=components,
        )
