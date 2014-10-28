import json
from os import path
import pkg_resources

from pylons.i18n import N_

from r2.lib.configparse import ConfigValue
from r2.lib.js import DataSource, LocalizedModule, Module
from r2.lib.plugin import Plugin


class Gold(Plugin):
    needs_static_build = True

    config = {
        ConfigValue.str: [
            "gold_hostname_file",
            "gold_servername_sr",
            "wiki_page_gold_features",
            "wiki_page_gold_partners",
        ],
    }

    js = {
        'gold': Module('gold.js',
            'gold.js',
            prefix='gold/',
        ),

        "snoovatar": LocalizedModule("snoovatar.js",
            "snoovatar.js",
            DataSource(
                wrap="r.snoovatar.initTailors({content})",
                data=json.load(pkg_resources.resource_stream(
                    __name__,
                    "data/tailors.json",
                )),
            ),
            prefix="snoovatar/",
        ),
    }

    errors = {
        "BAD_CSS_COLOR": N_("invalid color"),
        "INVALID_SNOOVATAR": N_("unknown or missing dressings"),
    }

    def add_routes(self, mc):
        mc('/gold/about', controller='gold', action='about')
        mc('/about/gold', controller='redirect', action='redirect',
           dest='/gold/about')
        mc('/gold/partners', controller='gold', action='partners')
        mc('/api/claim_gold_partner_deal_code', controller='goldapi', action='claim_gold_partner_deal_code')

        mc('/user/:username/snoo', controller='gold', action='snoovatar')
        mc("/api/gold/snoovatar", controller='goldapi', action='snoovatar')

    def load_controllers(self):
        from reddit_gold.controllers import GoldController, GoldApiController

        from reddit_gold.server_naming import hooks
        hooks.register_all()

        self.tailors_data = json.load(pkg_resources.resource_stream(
            __name__,
            "data/tailors.json",
        ))
