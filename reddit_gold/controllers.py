import json

from pylons import tmpl_context as c
from pylons import app_globals as g
from pylons import response
from pylons.i18n import _

from r2.config import feature
from r2.controllers import add_controller
from r2.controllers.reddit_base import RedditController
from r2.lib.errors import errors
from r2.lib.require import require, RequirementException
from r2.lib.validator import (
    json_validate,
    validate,
    validatedForm,
    VBoolean,
    VExistingUname,
    VGold,
    VJSON,
    VModhash,
    VUser,
)
from reddit_gold.models import SnoovatarsByAccount
from reddit_gold.pages import (
    GoldInfoPage,
    Snoovatar,
    SnoovatarProfilePage,
)
from reddit_gold.validators import VSnooColor


@add_controller
class GoldController(RedditController):
    def GET_about(self):
        return GoldInfoPage(
            _("gold"),
            show_sidebar=False,
            page_classes=["gold-page-ga-tracking"]
        ).render()

    def GET_partners(self):
        self.redirect("/gold/about", code=301)

    @validate(
        vuser=VExistingUname("username"),
    )
    def GET_snoovatar(self, vuser):
        if not vuser or vuser._deleted:
            self.abort404()

        snoovatar = SnoovatarsByAccount.load(vuser, "snoo")

        user_is_owner = c.user_is_loggedin and c.user == vuser
        if not user_is_owner:
            if not snoovatar or not snoovatar["public"]:
                self.abort404()

        return SnoovatarProfilePage(
            user=vuser,
            content=Snoovatar(
                editable=user_is_owner,
                snoovatar=snoovatar,
                username=vuser.name,
            ),
        ).render()


@add_controller
class GoldApiController(RedditController):
    @validate(
        VUser(),
    )
    def GET_snoovatar(self):
        snoovatar = SnoovatarsByAccount.load(c.user, "snoo")
        response.content_type = "application/json"
        return json.dumps(snoovatar)

    @validatedForm(
        VUser(),
        VModhash(),
        public=VBoolean("public"),
        snoo_color=VSnooColor("snoo_color"),
        unvalidated_components=VJSON("components"),
    )
    def POST_snoovatar(self, form, jquery, public, snoo_color, unvalidated_components):
        if form.has_errors("components",
                           errors.NO_TEXT,
                           errors.TOO_LONG,
                           errors.BAD_STRING,
                          ):
            return
        if form.has_errors("snoo_color", errors.BAD_CSS_COLOR):
            return

        try:
            tailors = g.plugins["gold"].tailors_data
            validated = {}

            for tailor in tailors:
                tailor_name = tailor["name"]

                component = unvalidated_components.get(tailor_name)

                # if the tailor requires a selection, ensure there is one
                if not tailor["allow_clear"]:
                    require(component)

                # ensure this dressing exists
                dressing = component.get("dressingName")
                if dressing:
                    for d in tailor["dressings"]:
                        if dressing == d["name"]:
                            break
                    else:
                        raise RequirementException

                validated[tailor_name] = component
        except RequirementException:
            c.errors.add(errors.INVALID_SNOOVATAR, field="components")
            form.has_errors("components", errors.INVALID_SNOOVATAR)
            return

        SnoovatarsByAccount.save(
            user=c.user,
            name="snoo",
            public=public,
            snoo_color=snoo_color,
            components=validated,
        )
